import { runProductionScoped } from '../src/lib/staging-prisma-scope.mjs';
import { releaseDatabase } from './release-request.mjs';

export async function runAfterSchoolSchedule(application, controller, env, ctx) {
  const metadata = {
    event: 'after-school-cron',
    cron: controller.cron,
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
  };
  try {
    const secret = env.AFTERSCHOOL_CRON_SECRET;
    if (typeof secret !== 'string' || secret.length < 32) {
      throw new Error('AFTERSCHOOL_CRON_SECRET is missing or too short');
    }
    const request = new Request(`https://${env.DAZHI_RELEASE_HOSTNAME}/api/cron/after-school`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    const connection = releaseDatabase(request, env);
    if (!connection) throw new Error('Production scheduled jobs are unavailable');

    // Dispatch inside this Worker so the existing route receives its OpenNext
    // environment and production database scope without a public HTTP round trip.
    const response = await runProductionScoped(connection, () => application.fetch(request, env, ctx));
    if (!response.ok) throw new Error(`After-school scheduler returned HTTP ${response.status}`);
    const result = await response.json();
    if (typeof result.status !== 'string') throw new Error('Invalid after-school scheduler response');
    console.log(JSON.stringify({
      ...metadata,
      status: result.status,
      preparationDate: result.preparationDate,
      deliveryStatus: result.deliveryStatus,
    }));
    if (result.status === 'PREPARATION_FAILED' || result.status === 'APPROVER_REVOKED') {
      throw new Error(`After-school scheduler reported ${result.status}`);
    }
  } catch (error) {
    // Do not log response bodies, credentials, or student lists.
    console.error(JSON.stringify({ ...metadata, status: 'FAILED' }));
    throw error;
  }
}
