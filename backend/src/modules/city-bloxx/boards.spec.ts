import { boardKey } from './boards.service';

describe('Daily board calendar partition', () => {
  const partition = {
    mode: 'daily' as const,
    physics_version: 'physics-v1',
    ruleset_version: 'daily-rules-v1',
    definition_id: 'daily-v1|2026-10-16',
  };
  it('matches a pg DATE decoded as local midnight to the public date query', () => {
    expect(boardKey({ ...partition, date_utc: new Date(2026, 9, 16) })).toBe(
      boardKey({ ...partition, date_utc: '2026-10-16' }),
    );
  });
  it('keeps neighboring dates separate and Quick independent of date decoding', () => {
    expect(boardKey({ ...partition, date_utc: new Date(2026, 9, 15) })).not.toBe(
      boardKey({ ...partition, date_utc: '2026-10-16' }),
    );
    expect(boardKey({ ...partition, mode: 'quick', date_utc: null })).toBe(
      JSON.stringify(['quick', 'physics-v1', 'daily-rules-v1']),
    );
  });
});
