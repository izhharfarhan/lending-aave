import { withRandomLatency } from './withRandomLatency';

// `sleep` palsu: mencatat berapa lama diminta menunggu, tanpa menunggu beneran (pola swap-web).
const recordSleeps = () => {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
};

describe('withRandomLatency()', () => {
  describe('positive', () => {
    it('waits random × 3 seconds before reading', async () => {
      const { sleeps, sleep } = recordSleeps();
      const read = withRandomLatency(async () => 'posisi', { enabled: () => true, random: () => 0.5, sleep });

      expect(await read()).toBe('posisi');
      expect(sleeps).toEqual([1500]);
    });
  });

  describe('negative', () => {
    it('does not wait when the toggle is off', async () => {
      const { sleeps, sleep } = recordSleeps();
      const read = withRandomLatency(async () => 'posisi', { enabled: () => false, random: () => 0.5, sleep });

      expect(await read()).toBe('posisi');
      expect(sleeps).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('reads the toggle on every call, not once when wrapped', async () => {
      const { sleeps, sleep } = recordSleeps();
      let on = false;
      const read = withRandomLatency(async () => 'posisi', { enabled: () => on, random: () => 1, sleep });

      await read();
      on = true;
      await read();
      expect(sleeps).toEqual([3000]);
    });
  });
});
