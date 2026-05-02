import { generateKnockoutBracket } from './src/lib/knockout-engine.ts';

const teams = Array.from({ length: 9 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
}));

try {
  const bracket = generateKnockoutBracket(teams);
  console.log("Success! Real matches:", bracket.rounds.flatMap(r => r.matches).filter(m => !m.isByeMatch).length);
} catch (e) {
  console.error(e.message);
}
