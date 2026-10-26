import { fileURLToPath } from "node:url";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = experimental_scanPublicSdkOnly(root, {
  allow: [
    /^@get-bb\/plugin-sdk\/testing$/,
    /^@testing-library\/react$/,
    /^react(?:-dom)?(?:\/.*)?$/,
    /^@radix-ui\/react-slot$/,
    /^class-variance-authority$/,
    /^clsx$/,
    /^tailwind-merge$/,
    /^vitest$/,
    /^@tanstack\/query-core$/,
  ],
});
if (result.violations.length || result.privateDependencies.length) {
  console.error(
    JSON.stringify(
      {
        violations: result.violations.slice(0, 20),
        privateDependencies: result.privateDependencies,
        totalViolations: result.violations.length,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(`Public SDK scan passed (${result.files.length} source files).`);
}
