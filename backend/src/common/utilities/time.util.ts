import ms, { StringValue } from 'ms';

export interface CooldownStatus {
  cooldownStartedAt: number;
  cooldown: number;
  remaining: number;
}

export class TimeUtil {
  /**
   * Normalize TTL for JWT and Redis
   */
  static getTtlValue(rawTtl: string | number): number {
    if (typeof rawTtl === 'string') {
      return Math.floor(ms(rawTtl as StringValue) / 1000);
    }

    return rawTtl;
  }

  /**
   * Calculate cooldown status based on the start time and cooldown duration.
   *
   * This function calculates how much time remains before the cooldown ends.
   *
   * All time values are in milliseconds.
   *
   * @param cooldownStartedAt - The Unix timestamp (in ms) when the cooldown started.
   * @param cooldown - The cooldown duration in milliseconds.
   * @returns An object containing:
   *   - cooldownStartedAt: the input start time,
   *   - cooldown: the input cooldown duration,
   *   - remaining: milliseconds remaining until cooldown ends (0 if passed).
   */
  static calculateCooldown(cooldownStartedAt: number, cooldown: number): CooldownStatus {
    if (!cooldownStartedAt) {
      return {
        cooldownStartedAt: null,
        cooldown: cooldown,
        remaining: 0,
      };
    }

    const now = Date.now();
    const elapsed = now - cooldownStartedAt;
    const remaining = Math.max(0, cooldown - elapsed);

    return {
      cooldownStartedAt: cooldownStartedAt,
      cooldown: cooldown,
      remaining,
    };
  }
}
