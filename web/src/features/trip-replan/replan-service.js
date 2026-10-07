import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { beginTripMutation, acceptTripReceipt, finishTripMutation } from '../../entities/trip/trip-mutation.js';

export async function removeStop(stopId, { renderLoader, renderView, scheduleTripMap } = {}) {
  const ticket = beginTripMutation();
  if (!ticket) { toast('行程正在更新，请完成后再操作。'); return; }
  state.loading = true;
  if (renderLoader) renderLoader();
  try {
    const data = await request('/api/trip/stops', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: ticket.sessionId,
        expectedVersion: ticket.version,
        operation: 'delete',
        stopId
      })
    });
    if (!acceptTripReceipt(ticket, data.trip)) return;
    toast('已移除该站点，当天路线与耗时已自动重新计算。');
  } catch (error) {
    if (ticket.owns()) toast(error.message);
  } finally {
    if (!finishTripMutation(ticket)) return;
    state.loading = false;
    if (renderView) renderView();
    if (scheduleTripMap) scheduleTripMap();
  }
}

export async function confirmReplan({ renderModals, renderLoader, render, scheduleTripMap } = {}) {
  const ticket = beginTripMutation();
  if (!ticket) { toast('行程正在更新，请完成后再操作。'); return; }
  const targetStopId = state.replan;
  const reason = state.reason;

  state.loading = true;
  state.replan = null;
  if (renderModals) renderModals();
  if (renderLoader) renderLoader();
  try {
    const data = await request('/api/replan', {
      method: 'POST',
      body: JSON.stringify({ sessionId: ticket.sessionId, expectedVersion: ticket.version, targetStopId, reason })
    });
    if (!acceptTripReceipt(ticket, data.trip)) return;
    state.memoryProposal = data.memoryProposal;
    const replacement = data.trip?.days?.flatMap((day) => day.stops || []).find((stop) => stop.id === targetStopId);
    toast(replacement?.name ? `已成功替换为【${replacement.name}】，其余站点保持不变。` : (data.message || '行程已更新。'));
  } catch (error) {
    if (ticket.owns()) toast(error.message);
  } finally {
    if (!finishTripMutation(ticket)) return;
    state.loading = false;
    if (render) render();
    if (scheduleTripMap) scheduleTripMap();
  }
}
