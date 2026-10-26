/**
 * Arrondi exact en arithmétique entière (BigInt) — aucune erreur de virgule flottante.
 * - `half-up` : demi au-dessus de zéro (arrondi commercial, règle TVA usuelle en France/UE).
 * - `half-even` : arrondi bancaire (demi vers le pair).
 * - `half-down`, `up` (loin de zéro), `down` (troncature), `ceil`, `floor`.
 */
export type RoundingMode = 'half-up' | 'half-even' | 'half-down' | 'up' | 'down' | 'ceil' | 'floor';

export const ROUNDING_MODES: readonly RoundingMode[] = ['half-up', 'half-even', 'half-down', 'up', 'down', 'ceil', 'floor'];

const abs = (n: bigint) => (n < 0n ? -n : n);

/** Division entière `numerator / denominator` arrondie selon `mode` (denominator ≠ 0). */
export const divideRounded = (numerator: bigint, denominator: bigint, mode: RoundingMode): bigint => {
  if (denominator === 0n) throw new RangeError('divideRounded: division par zéro');
  if (denominator < 0n) return divideRounded(-numerator, -denominator, mode);
  const quotient = numerator / denominator; // tronqué vers zéro
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const sign = numerator < 0n ? -1n : 1n;
  const twice = abs(remainder) * 2n;
  const away = quotient + sign;
  switch (mode) {
    case 'down':
      return quotient;
    case 'up':
      return away;
    case 'ceil':
      return sign > 0n ? away : quotient;
    case 'floor':
      return sign < 0n ? away : quotient;
    case 'half-up':
      return twice >= denominator ? away : quotient;
    case 'half-down':
      return twice > denominator ? away : quotient;
    case 'half-even':
      if (twice > denominator) return away;
      if (twice < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : away;
  }
};
