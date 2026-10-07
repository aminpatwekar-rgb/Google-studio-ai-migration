import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { getCallerAuthority, writeAuditLog } from "@/lib/admin.functions";
import { sendSystemEmail } from "@/lib/email.server";

export interface FirestoreUsageMetrics {
  totalDocuments: number;
  collectionBreakdown: Record<string, number>;
  estimatedStorageBytes: number;
  estimatedStorageMB: number;
  estimatedMonthlyCostUSD: number;
  budgetUSD: number;
  usagePercent: number;
  thresholdPercent: number;
  status: "healthy" | "warning" | "critical";
  lastCheckedAt: string;
  alertRecipient: string;
  freeTierStatus: {
    storagePercentOfFree: number;
    readsDailyEstimate: number;
    writesDailyEstimate: number;
  };
}

export interface BillingConfig {
  monthlyBudgetUSD: number;
  alertThresholdPercent: number;
  alertEmail: string;
  autoAlertEnabled: boolean;
  lastAlertSentAt?: string | null;
  lastAlertStatus?: string | null;
  lastUsagePercent?: number;
}

export interface BillingAlertRecord {
  id: string;
  timestamp: string;
  usagePercent: number;
  estimatedCostUSD: number;
  budgetUSD: number;
  recipient: string;
  status: "sent" | "simulated" | "failed";
  reason: string;
  messageId?: string;
  metricsSnapshot?: {
    totalDocuments: number;
    estimatedStorageMB: number;
    topCollections: Record<string, number>;
  };
}

const DEFAULT_CONFIG: BillingConfig = {
  monthlyBudgetUSD: 10.0,
  alertThresholdPercent: 80,
  alertEmail: "aminpatwekar@gmail.com",
  autoAlertEnabled: true,
};

// Monitored Firestore collections
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
] as const;

export async function getBillingConfigFromDb(): Promise<BillingConfig> {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("system").doc("billing_config").get();
    if (snap.exists) {
      const data = snap.data();
      return {
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
    console.warn("Could not read billing_config, using defaults:", err);
  }
  return { ...DEFAULT_CONFIG };
}

export async function calculateFirestoreMetrics(): Promise<{
  metrics: FirestoreUsageMetrics;
  config: BillingConfig;
}> {
  const config = await getBillingConfigFromDb();

  const collectionBreakdown: Record<string, number> = {};
  let totalDocs = 0;

  for (const colName of TRACKED_COLLECTIONS) {
    try {
      const { adminDb } = await import("@/lib/firebase/admin");
      const countSnap = await adminDb.collection(colName).count().get();
      const count = countSnap.data().count;
      collectionBreakdown[colName] = count;
      totalDocs += count;
    } catch {
      // In case collection doesn't exist or aggregation isn't supported for that collection
      collectionBreakdown[colName] = 0;
    }
  }

  // Firestore Pricing Model (GCP us-central1 / multi-region benchmark):
  // Free tier: 1 GiB storage, 50,000 document reads/day, 20,000 document writes/day.
  // Overages:
  // - Storage: $0.108 per GiB/month ($0.000105 per MB/month)
  // - Reads: $0.06 per 100,000 reads
  // - Writes: $0.18 per 100,000 writes
  // - Deletes: $0.02 per 100,000 deletes

  // Average document size in educational hubs: ~2.8 KB (including indexed fields & text)
  const averageDocSizeBytes = 2800;
  const estimatedStorageBytes = totalDocs * averageDocSizeBytes;
  const estimatedStorageMB = Math.round((estimatedStorageBytes / (1024 * 1024)) * 100) / 100;

  // Estimated daily read/write volume based on submission activity & users
  const activeStudents = collectionBreakdown["users"] || 10;
  const totalSubmissions = collectionBreakdown["submissions"] || 0;
  const estimatedDailyReads = Math.max(1000, activeStudents * 80 + totalSubmissions * 5);
  const estimatedDailyWrites = Math.max(300, activeStudents * 20 + totalSubmissions * 2);

  // Free Tier comparison
  const freeTierStorageMB = 1024; // 1 GiB
  const billableStorageMB = Math.max(0, estimatedStorageMB - freeTierStorageMB);
  const monthlyStorageCost = billableStorageMB * 0.000105;

  const monthlyReads = estimatedDailyReads * 30;
  const freeTierMonthlyReads = 50000 * 30; // 1.5M reads/mo
  const billableReads = Math.max(0, monthlyReads - freeTierMonthlyReads);
  const monthlyReadsCost = (billableReads / 100000) * 0.06;

  const monthlyWrites = estimatedDailyWrites * 30;
  const freeTierMonthlyWrites = 20000 * 30; // 600k writes/mo
  const billableWrites = Math.max(0, monthlyWrites - freeTierMonthlyWrites);
  const monthlyWritesCost = (billableWrites / 100000) * 0.18;

  // Estimated baseline project overhead: Firestore instance base + minimal operations
  const baseCost = 0.5; // Baseline minimum compute/egress allocation
  const estimatedMonthlyCostUSD =
    Math.round((baseCost + monthlyStorageCost + monthlyReadsCost + monthlyWritesCost) * 100) / 100;

  const budget = config.monthlyBudgetUSD;
  const usagePercent = Math.round((estimatedMonthlyCostUSD / budget) * 1000) / 10;

  let status: "healthy" | "warning" | "critical" = "healthy";
  if (usagePercent >= 95) {
    status = "critical";
  } else if (usagePercent >= config.alertThresholdPercent) {
    status = "warning";
  }

  const metrics: FirestoreUsageMetrics = {
    totalDocuments: totalDocs,
    collectionBreakdown,
    estimatedStorageBytes,
    estimatedStorageMB,
    estimatedMonthlyCostUSD,
    budgetUSD: budget,
    usagePercent,
    thresholdPercent: config.alertThresholdPercent,
    status,
    lastCheckedAt: new Date().toISOString(),
    alertRecipient: config.alertEmail,
    freeTierStatus: {
      storagePercentOfFree: Math.min(
        100,
        Math.round((estimatedStorageMB / freeTierStorageMB) * 1000) / 10,
      ),
      readsDailyEstimate: estimatedDailyReads,
      writesDailyEstimate: estimatedDailyWrites,
    },
  };

  return { metrics, config };
}

export function formatBillingAlertEmail(
  metrics: FirestoreUsageMetrics,
  reason: string,
  isTest = false,
): { subject: string; html: string; text: string } {
  const isUrgent = metrics.usagePercent >= 95;
  const prefix = isTest ? "[TEST ALERT]" : isUrgent ? "[CRITICAL ALERT]" : "[WARNING]";
  const subject = `${prefix} ONYX Firestore Usage Alert: ${metrics.usagePercent}% of $${metrics.budgetUSD.toFixed(2)} Budget Reached`;

  const topColsHtml = Object.entries(metrics.collectionBreakdown)
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
      <head>
        <meta charset="utf-8" />
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 28px; text-align: left;">
              <span style="background-color: ${
                isUrgent ? "#ef4444" : "#f59e0b"
              }; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px;">
                ${isTest ? "Simulated Test" : isUrgent ? "Critical Threshold" : "Budget Warning"}
              </span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 14px 0 6px 0; letter-spacing: -0.02em;">
                Firestore Usage Alert
              </h1>
              <p style="color: #cbd5e1; font-size: 14px; margin: 0;">
                ONYX Platform Infrastructure Monitoring
              </p>
            </td>
          </tr>

          <!-- Summary Block -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
                Hello Super Administrator,<br /><br />
                This automated notification was generated by the <strong>ONYX Cloud Usage Monitor</strong>.
                Your Firestore database usage is approaching your configured project budget threshold.
              </p>

              <!-- KPI Metric Boxes -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td width="33%" style="padding: 12px; background-color: #f1f5f9; border-radius: 8px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Current Usage</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${
                      isUrgent ? "#b91c1c" : "#b45309"
                    }; margin-top: 4px;">
                      ${metrics.usagePercent}%
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="30%" style="padding: 12px; background-color: #f1f5f9; border-radius: 8px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Est. Monthly</div>
                    <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">
                      $${metrics.estimatedMonthlyCostUSD.toFixed(2)}
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="33%" style="padding: 12px; background-color: #f1f5f9; border-radius: 8px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Monthly Budget</div>
                    <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">
                      $${metrics.budgetUSD.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Progress bar representation -->
              <div style="background-color: #e2e8f0; border-radius: 9999px; height: 10px; width: 100%; overflow: hidden; margin-bottom: 24px;">
                <div style="background-color: ${
                  isUrgent ? "#ef4444" : "#f59e0b"
                }; height: 10px; width: ${Math.min(100, metrics.usagePercent)}%; border-radius: 9999px;"></div>
              </div>

              <!-- Top Collections Table -->
              <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.03em; margin: 20px 0 10px 0;">
                Firestore Collections Breakdown (${metrics.totalDocuments.toLocaleString()} total documents)
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Collection</th>
                    <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  ${topColsHtml}
                </tbody>
              </table>

              <!-- Recommended Actions -->
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #1e40af;">
                  💡 Recommended Preventive Actions:
                </h4>
                <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #1e3a8a; line-height: 1.5;">
                  <li>Archive or prune historical submissions and expired assignments.</li>
                  <li>Clean up resolved audit log entries or export them to cold storage.</li>
                  <li>Verify that client listeners use filtered queries with limits instead of full collections.</li>
                  <li>Adjust your budget limit in the ONYX Super Admin console if your student base has expanded.</li>
                </ul>
              </div>

              <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                Trigger Reason: ${reason}<br />
                Monitored Database: <code>ai-studio-lovablecodeconti-dcb59e73-4e76-4216-a36a-c1e5f9cecb64</code><br />
                GCP Project: <code>erudite-airship-2wjrd</code><br />
                Timestamp: ${new Date(metrics.lastCheckedAt).toUTCString()}
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = `
ONYX FIRESTORE USAGE ALERT
----------------------------------------
Status: ${isUrgent ? "CRITICAL" : "WARNING"}
Usage: ${metrics.usagePercent}% of $${metrics.budgetUSD.toFixed(2)} Monthly Budget
Estimated Monthly Cost: $${metrics.estimatedMonthlyCostUSD.toFixed(2)}
Total Documents: ${metrics.totalDocuments.toLocaleString()}
Estimated Storage: ${metrics.estimatedStorageMB} MB

Trigger: ${reason}
Database: ai-studio-lovablecodeconti-dcb59e73-4e76-4216-a36a-c1e5f9cecb64
Checked: ${metrics.lastCheckedAt}
`;

  return { subject, html, text };
}

export async function dispatchBillingAlertNotification(
  metrics: FirestoreUsageMetrics,
  reason: string,
  isTest = false,
): Promise<{ success: boolean; messageId?: string }> {
  const { subject, html, text } = formatBillingAlertEmail(metrics, reason, isTest);
  const recipient = metrics.alertRecipient || "aminpatwekar@gmail.com";

  const result = await sendSystemEmail({
    to: recipient,
    subject,
    html,
    text,
    category: "billing",
  });

  const alertRecord: Omit<BillingAlertRecord, "id"> = {
    timestamp: new Date().toISOString(),
    usagePercent: metrics.usagePercent,
    estimatedCostUSD: metrics.estimatedMonthlyCostUSD,
    budgetUSD: metrics.budgetUSD,
    recipient,
    status: result.success
      ? result.messageId?.startsWith("sim_")
        ? "simulated"
        : "sent"
      : "failed",
    reason,
    messageId: result.messageId,
    metricsSnapshot: {
      totalDocuments: metrics.totalDocuments,
      estimatedStorageMB: metrics.estimatedStorageMB,
      topCollections: metrics.collectionBreakdown,
    },
  };

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const alertRef = await adminDb.collection("billing_alerts").add(alertRecord);

    await adminDb.collection("system").doc("billing_config").set(
      {
        lastAlertSentAt: alertRecord.timestamp,
        lastAlertStatus: alertRecord.status,
        lastUsagePercent: metrics.usagePercent,
        lastAlertId: alertRef.id,
      },
      { merge: true },
    );
  } catch (err) {
    console.error("Failed to persist billing alert record in firestore:", err);
  }

  return result;
}

// ==========================================
// TanStack Server Functions (Authenticated)
// ==========================================

export const getFirestoreBillingMetrics = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const authority = await getCallerAuthority(context.userId, context.email);
    if (!authority.isSuperAdmin) {
      throw new Error("Access denied: Super Admin authorization required.");
    }

    const { metrics, config } = await calculateFirestoreMetrics();

    // Fetch up to 10 recent billing alerts
    let recentAlerts: BillingAlertRecord[] = [];
    try {
      const { adminDb } = await import("@/lib/firebase/admin");
      const snap = await adminDb
        .collection("billing_alerts")
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

      recentAlerts = snap.docs.map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<BillingAlertRecord, "id">),
      }));
    } catch {
      recentAlerts = [];
    }

    return { metrics, config, recentAlerts };
  });

export const updateFirestoreBillingConfig = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(
    (input: {
      monthlyBudgetUSD: number;
      alertThresholdPercent: number;
      alertEmail: string;
      autoAlertEnabled: boolean;
    }) => {
      if (!input) throw new Error("Invalid billing configuration input");
      const budget = Number(input.monthlyBudgetUSD);
      const threshold = Number(input.alertThresholdPercent);
      const email = String(input.alertEmail || "").trim();

      if (isNaN(budget) || budget < 1 || budget > 10000) {
        throw new Error("Monthly budget must be between $1.00 and $10,000.00");
      }
      if (isNaN(threshold) || threshold < 10 || threshold > 100) {
        throw new Error("Alert threshold must be between 10% and 100%");
      }
      if (!email.includes("@")) {
        throw new Error("A valid email address is required for billing alerts");
      }

      return {
        monthlyBudgetUSD: budget,
        alertThresholdPercent: threshold,
        alertEmail: email,
        autoAlertEnabled: Boolean(input.autoAlertEnabled),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const authority = await getCallerAuthority(context.userId, context.email);
    if (!authority.isSuperAdmin) {
      throw new Error("Access denied: Super Admin authorization required.");
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("system").doc("billing_config").set(
      {
        monthlyBudgetUSD: data.monthlyBudgetUSD,
        alertThresholdPercent: data.alertThresholdPercent,
        alertEmail: data.alertEmail,
        autoAlertEnabled: data.autoAlertEnabled,
        updatedAt: new Date().toISOString(),
        updatedBy: context.userId,
      },
      { merge: true },
    );

    await writeAuditLog(context.userId, "update_billing_config", "system/billing_config", data);

    return { ok: true, config: data };
  });

export const runFirestoreBillingCheckNow = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const authority = await getCallerAuthority(context.userId, context.email);
    if (!authority.isSuperAdmin) {
      throw new Error("Access denied: Super Admin authorization required.");
    }

    const { metrics, config } = await calculateFirestoreMetrics();

    let alertTriggered = false;
    let alertSent = false;
    let reason = "Usage is well within the configured budget threshold.";

    if (metrics.usagePercent >= config.alertThresholdPercent) {
      alertTriggered = true;
      reason = `Project usage (${metrics.usagePercent}%) has reached or exceeded the configured threshold of ${config.alertThresholdPercent}%.`;

      // Check throttling: alert if no alert sent in last 24h, or if critical (>=95%)
      const lastSent = config.lastAlertSentAt ? new Date(config.lastAlertSentAt).getTime() : 0;
      const hoursSinceLastAlert = (Date.now() - lastSent) / (1000 * 60 * 60);

      const shouldSend = hoursSinceLastAlert >= 24 || metrics.usagePercent >= 95;

      if (shouldSend) {
        const sendResult = await dispatchBillingAlertNotification(metrics, reason, false);
        alertSent = sendResult.success;
      } else {
        reason += ` (Notification skipped: an alert was already sent within the past 24 hours)`;
      }
    }

    await writeAuditLog(context.userId, "run_billing_check", "firestore", {
      usagePercent: metrics.usagePercent,
      estimatedMonthlyCostUSD: metrics.estimatedMonthlyCostUSD,
      alertTriggered,
      alertSent,
    });

    return {
      ok: true,
      metrics,
      alertTriggered,
      alertSent,
      reason,
    };
  });

export const sendTestBillingAlertEmail = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { email?: string }) => {
    return { email: input?.email };
  })
  .handler(async ({ data, context }) => {
    const authority = await getCallerAuthority(context.userId, context.email);
    if (!authority.isSuperAdmin) {
      throw new Error("Access denied: Super Admin authorization required.");
    }

    const { metrics, config } = await calculateFirestoreMetrics();
    const recipient = data?.email || config.alertEmail || "aminpatwekar@gmail.com";

    // Set sample alert test metrics (simulating 85% usage)
    const testMetrics: FirestoreUsageMetrics = {
      ...metrics,
      usagePercent: 85.4,
      estimatedMonthlyCostUSD: Math.round(metrics.budgetUSD * 0.854 * 100) / 100,
      status: "warning",
      alertRecipient: recipient,
    };

    const result = await dispatchBillingAlertNotification(
      testMetrics,
      "Super Admin initiated a test alert from the admin console",
      true,
    );

    await writeAuditLog(context.userId, "test_billing_alert_email", recipient, {
      success: result.success,
      messageId: result.messageId,
    });

    return {
      ok: result.success,
      recipient,
      messageId: result.messageId,
    };
  });
