import { addedDriveS, driveS } from './compare';

// locations 0 (home), 1, 2
const matrix = [
  [0, 10, 40],
  [12, 0, 15],
  [45, 20, 0],
];

describe('driveS', () => {
  it('sums the legs along the path', () => {
    expect(driveS([0, 1, 2, 0], matrix)).toBe(10 + 15 + 45);
  });
  it('is 0 for a single point', () => {
    expect(driveS([0], matrix)).toBe(0);
  });
});

describe('addedDriveS', () => {
  it('is after minus before', () => {
    expect(addedDriveS(70, 95)).toBe(25);
  });
});
