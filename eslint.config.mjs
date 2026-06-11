import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// ESLint-9-Flat-Config: `next lint` wurde in Next.js 16 entfernt; das
// lint-Script ruft eslint direkt auf. eslint-config-next ≥16 liefert die
// Flat-Config nativ (ersetzt das frühere .eslintrc.json).
const config = [
  ...nextCoreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "src/generated/**", "public/**"],
  },
  {
    // Vendor-Code (shadcn/ui, per CLI kopiert) nicht an neuen Strict-Regeln messen
    files: ["src/components/ui/**"],
    rules: { "react-hooks/purity": "off" },
  },
];

export default config;
