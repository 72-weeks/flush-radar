const templates = [
  (n: string) => `${n} var lett å finne og overraskende rent. Litt kø i travle tider, men det går fort.`,
  (n: string) => `God tilgjengelighet og papir på plass. ${n} funker bra for en rask stopp.`,
  (n: string) => `Trangt, men ryddig. ${n} gjør jobben – også greit for barnevogn.`,
];

export function synthReview(name?: string): string {
  const n = name || "Toalettet";
  const t = templates[Math.floor(Math.random() * templates.length)];
  return t(n);
}

