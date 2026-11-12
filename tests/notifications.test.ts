import { describe, expect, it } from 'vitest';
import { byManagement, managementAlerts, needsManagement } from '../lib/notifications';

const people = [
  { id: 'a', name: 'Anna', troopId: 't1', patrolId: 'p1' },
  { id: 'b', name: 'Bruno', troopId: 't1' },
  { id: 'c', name: 'Carla', troopId: 't1', patrolId: 'p1', selfAssigned: true },
  { id: 'd', name: 'Dario', troopId: 't2' },
];
const leader = { role: 'leader' as const, troopIds: ['t1'] };

describe('management alerts', () => {
  it('counts the unassigned and the self-assigned in managed troops only', () => {
    expect(managementAlerts(people, leader)).toEqual({ unassigned: 1, toConfirm: 1, total: 2 });
  });

  it('counts an admin’s own troops only, and nothing for an explorer', () => {
    expect(managementAlerts(people, { role: 'admin', troopIds: [] }).total).toBe(0);
    expect(managementAlerts(people, { role: 'admin', troopIds: ['t2'] }).total).toBe(1);
    expect(managementAlerts(people, { role: 'explorer', troopIds: ['t1'] }).total).toBe(0);
  });

  it('goes quiet once everyone is placed and confirmed', () => {
    const settled = people.map((p) => ({ ...p, patrolId: 'p1', selfAssigned: undefined }));
    expect(managementAlerts(settled, leader).total).toBe(0);
  });

  it('puts whoever needs a leader first in the roster, then by name', () => {
    const order = [...people].filter((p) => p.troopId === 't1').sort(byManagement);
    expect(order.map((p) => p.name)).toEqual(['Bruno', 'Carla', 'Anna']);
    expect(order.map(needsManagement)).toEqual([true, true, false]);
  });
});
