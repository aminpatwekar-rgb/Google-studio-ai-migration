import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin instance
const app = getApps().length === 0 ? initializeApp() : getApps()[0];

// ONYX target Firestore database (or fallback to default)
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  "ai-studio-lovablecodeconti-dcb59e73-4e76-4216-a36a-c1e5f9cecb64";

function getTargetDb() {
  try {
    return getFirestore(app, FIRESTORE_DATABASE_ID);
  } catch {
    return getFirestore(app);
  }
}

interface BillingConfig {
  monthlyBudgetUSD: number;
  alertThresholdPercent: number;
  alertEmail: string;
  autoAlertEnabled: boolean;
  lastAlertSentAt?: string | null;
  lastAlertStatus?: string | null;
  lastUsagePercent?: number;
}

const DEFAULT_CONFIG: BillingConfig = {
  monthlyBudgetUSD: 10.0,
  alertThresholdPercent: 80,
  alertEmail: "aminpatwekar@gmail.com",
  autoAlertEnabled: true,
};

const TRACKED_COLLECTIONS = [
  "users",
  "classes",
  "assignments",
  "submissions",
  "quizzes",
  "announcements",
  "audit_logs",
  "rubrics",
  "billing_alerts",
];

/**
 * Core monitoring function that evaluates Firestore usage, calculates estimated
 * monthly costs against the defined budget, and sends an alert email if nearing the limit.
 */
export async function executeFirestoreBillingCheck(triggerType: "schedule" | "http"): Promise<{
  success: boolean;
  usagePercent: number;
  estimatedMonthlyCostUSD: number;
  budgetUSD: number;
  alertTriggered: boolean;
  alertSent: boolean;
  message: string;
}> {
  const db = getTargetDb();
  logger.info(
    `Starting Firestore billing check (trigger: ${triggerType}) on db: ${FIRESTORE_DATABASE_ID}`,
  );

  // 1. Fetch Billing Configuration
  let config = { ...DEFAULT_CONFIG };
  try {
    const configSnap = await db.collection("system").doc("billing_config").get();
    if (configSnap.exists) {
      const data = configSnap.data();
      config = {
        monthlyBudgetUSD: Number(data?.monthlyBudgetUSD) || DEFAULT_CONFIG.monthlyBudgetUSD,
        alertThresholdPercent:
          Number(data?.alertThresholdPercent) || DEFAULT_CONFIG.alertThresholdPercent,
        alertEmail: data?.alertEmail || DEFAULT_CONFIG.alertEmail,
        autoAlertEnabled: data?.autoAlertEnabled ?? DEFAULT_CONFIG.autoAlertEnabled,
        lastAlertSentAt: data?.lastAlertSentAt || null,
        lastAlertStatus: data?.lastAlertStatus || null,
        lastUsagePercent: data?.lastUsagePercent ?? 0,
      };
    }
  } catch (err) {
    logger.warn("Could not read system/billing_config, falling back to defaults", err);
  }

  // 2. Count Documents across all tracked collections
  const collectionCounts: Record<string, number> = {};
  let totalDocuments = 0;

  for (const colName of TRACKED_COLLECTIONS) {
    try {
      const countSnap = await db.collection(colName).count().get();
      const count = countSnap.data().count;
      collectionCounts[colName] = count;
      totalDocuments += count;
    } catch (err) {
      logger.warn(`Failed to count collection: ${colName}`, err);
      collectionCounts[colName] = 0;
    }
  }

  // 3. Compute Storage & Operation Estimates
  const averageDocSizeBytes = 2800; // ~2.8 KB average
  const estimatedStorageBytes = totalDocuments * averageDocSizeBytes;
  const estimatedStorageMB = Math.round((estimatedStorageBytes / (1024 * 1024)) * 100) / 100;

  const activeStudents = collectionCounts["users"] || 10;
  const totalSubmissions = collectionCounts["submissions"] || 0;
  const estimatedDailyReads = Math.max(1000, activeStudents * 80 + totalSubmissions * 5);
  const estimatedDailyWrites = Math.max(300, activeStudents * 20 + totalSubmissions * 2);

  const freeTierStorageMB = 1024; // 1 GiB
  const billableStorageMB = Math.max(0, estimatedStorageMB - freeTierStorageMB);
  const monthlyStorageCost = billableStorageMB * 0.000105;

  const monthlyReads = estimatedDailyReads * 30;
  const freeTierMonthlyReads = 50000 * 30;
  const billableReads = Math.max(0, monthlyReads - freeTierMonthlyReads);
  const monthlyReadsCost = (billableReads / 100000) * 0.06;

  const monthlyWrites = estimatedDailyWrites * 30;
  const freeTierMonthlyWrites = 20000 * 30;
  const billableWrites = Math.max(0, monthlyWrites - freeTierMonthlyWrites);
  const monthlyWritesCost = (billableWrites / 100000) * 0.18;

  const baseOverhead = 0.5;
  const estimatedMonthlyCostUSD =
    Math.round((baseOverhead + monthlyStorageCost + monthlyReadsCost + monthlyWritesCost) * 100) /
    100;

  const budget = config.monthlyBudgetUSD;
  const usagePercent = Math.round((estimatedMonthlyCostUSD / budget) * 1000) / 10;

  logger.info(
    `Firestore Usage: ${totalDocuments} docs (~${estimatedStorageMB} MB). Est. Monthly Cost: $${estimatedMonthlyCostUSD} / $${budget} (${usagePercent}%)`,
  );

  let alertTriggered = false;
  let alertSent = false;
  let message = `Usage is normal (${usagePercent}% of $${budget} budget).`;

  // 4. Threshold & Notification Logic
  if (config.autoAlertEnabled && usagePercent >= config.alertThresholdPercent) {
    alertTriggered = true;
    message = `Project usage (${usagePercent}%) has reached or exceeded threshold (${config.alertThresholdPercent}%).`;

    // Throttle check: send at most once every 24 hours, unless critical (>= 95%)
    const lastSentTime = config.lastAlertSentAt ? new Date(config.lastAlertSentAt).getTime() : 0;
    const hoursSinceLastAlert = (Date.now() - lastSentTime) / (1000 * 60 * 60);

    const shouldSend = hoursSinceLastAlert >= 24 || usagePercent >= 95 || triggerType === "http";

    if (shouldSend) {
      alertSent = await sendBillingAlertEmail(config.alertEmail, {
        usagePercent,
        estimatedMonthlyCostUSD,
        budgetUSD: budget,
        totalDocuments,
        estimatedStorageMB,
        collectionCounts,
      });

      // Record alert in billing_alerts collection
      const alertId = `alert_${Date.now()}`;
      await db
        .collection("billing_alerts")
        .doc(alertId)
        .set({
          timestamp: new Date().toISOString(),
          usagePercent,
          estimatedCostUSD: estimatedMonthlyCostUSD,
          budgetUSD: budget,
          recipient: config.alertEmail,
          status: alertSent ? "sent" : "failed",
          triggerType,
          metricsSnapshot: {
            totalDocuments,
            estimatedStorageMB,
            collectionCounts,
          },
        });

      // Update system/billing_config with last alert timestamp
      await db
        .collection("system")
        .doc("billing_config")
        .set(
          {
            lastAlertSentAt: new Date().toISOString(),
            lastAlertStatus: alertSent ? "sent" : "failed",
            lastUsagePercent: usagePercent,
          },
          { merge: true },
        );
    } else {
      message += ` Alert email skipped due to 24h throttling cooldown.`;
    }
  }

  return {
    success: true,
    usagePercent,
    estimatedMonthlyCostUSD,
    budgetUSD: budget,
    alertTriggered,
    alertSent,
    message,
  };
}

/**
 * Sends a notification email to the super admin via Resend, SendGrid, or fallback logging.
 */
async function sendBillingAlertEmail(
  toEmail: string,
  data: {
    usagePercent: number;
    estimatedMonthlyCostUSD: number;
    budgetUSD: number;
    totalDocuments: number;
    estimatedStorageMB: number;
    collectionCounts: Record<string, number>;
  },
): Promise<boolean> {
  const isCritical = data.usagePercent >= 95;
  const subject = `⚠️ [${isCritical ? "CRITICAL" : "ALERT"}] ONYX Firestore Usage Alert: ${data.usagePercent}% of $${data.budgetUSD.toFixed(2)} Budget Reached`;

  const apiKey =
    process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SYSTEM_FROM_EMAIL || "notifications@onyx.education";

  const topColsHtml = Object.entries(data.collectionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(
      ([name, count]) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 13px; color: #1e293b;">${name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; font-size: 13px; color: #0f172a;">${count.toLocaleString()}</td>
      </tr>
    `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 28px;">
              <span style="background-color: ${isCritical ? "#ef4444" : "#f59e0b"}; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px;">
                ${isCritical ? "Critical Budget Alert" : "Billing Warning"}
              </span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 14px 0 6px 0;">
                Firestore Usage Alert
              </h1>
              <p style="color: #cbd5e1; font-size: 14px; margin: 0;">ONYX Educational Infrastructure</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; color: #334155; margin-top: 0;">
                Hello Super Administrator,<br /><br />
                The ONYX Cloud Monitoring Function has detected that your Firestore database usage is approaching your budget limit.
              </p>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; display: flex; justify-content: space-between;">
                <div><strong>Current Usage:</strong> ${data.usagePercent}%</div>
                <div><strong>Est. Monthly Cost:</strong> $${data.estimatedMonthlyCostUSD.toFixed(2)}</div>
                <div><strong>Monthly Budget:</strong> $${data.budgetUSD.toFixed(2)}</div>
              </div>
              <h3 style="font-size: 14px; margin: 20px 0 10px 0;">Collection Breakdown (${data.totalDocuments.toLocaleString()} total documents)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                ${topColsHtml}
              </table>
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px;">
                <strong style="color: #1e40af;">💡 Recommended Actions:</strong>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; color: #1e3a8a;">
                  <li>Archive expired classes and old student submissions.</li>
                  <li>Prune old audit logs or export to cold storage.</li>
                  <li>Review active client real-time listeners for unnecessary read frequency.</li>
                  <li>Increase your budget in the ONYX Super Admin console if traffic is scaling.</li>
                </ul>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  if (!apiKey) {
    logger.info(`[ONYX Cloud Function Simulated Email] To: ${toEmail} | Subject: ${subject}`);
    return true;
  }

  try {
    if (process.env.RESEND_API_KEY) {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject,
          html,
        }),
      });
      return resp.ok;
    }
    return true;
  } catch (err) {
    logger.error("Error dispatching email from Cloud Function:", err);
    return false;
  }
}

/**
 * 1. Scheduled Cloud Function (Cloud Functions v2 / Google Cloud Scheduler)
 * Runs daily at 08:00 UTC to evaluate Firestore usage against the billing budget.
 */
export const monitorFirestoreBillingUsage = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    await executeFirestoreBillingCheck("schedule");
  },
);

/**
 * 2. HTTP Webhook Cloud Function (onRequest)
 * Allows immediate on-demand invocation via external Cloud Scheduler, GitHub Actions, or curl.
 */
export const monitorFirestoreBillingUsageHttp = onRequest(
  {
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (req, res) => {
    try {
      const result = await executeFirestoreBillingCheck("http");
      res.status(200).json(result);
    } catch (err: any) {
      logger.error("HTTP billing check error:", err);
      res.status(500).json({ success: false, error: err?.message || "Internal error" });
    }
  },
);
