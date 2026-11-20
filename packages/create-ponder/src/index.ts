#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, AbiEvent } from "abitype";
import { cac } from "cac";
import cpy from "cpy";
import { execa } from "execa";
import fs from "fs-extra";
import { oraPromise } from "ora";
import pico from "picocolors";
import prettier from "prettier";
import { default as prompts } from "prompts";
import rootPackageJson from "../package.json" with { type: "json" };

import { getPackageManager } from "./helpers/getPackageManager.js";
import { mergeAbis } from "./helpers/mergeAbis.js";
import { notifyUpdate } from "./helpers/notifyUpdate.js";
import {
  ValidationError,
  validateProjectName,
  validateProjectPath,
  validateTemplateName,
} from "./helpers/validate.js";

const log = console.log;

export type SerializableChain = {
  id: number;
  rpc: string;
};

export type SerializableContract = {
  abi:
    | { abi: Abi; name: string; dir: string }
    | { abi: Abi; name: string; dir: string }[];
  address: string;
  chain: Record<string, any> | string;
  startBlock?: number;
};

export type SerializableConfig = {
  chains: Record<string, SerializableChain>;
  contracts: Record<string, SerializableContract>;
};

export type Template = {
  title: string;
  description: string;
  id: string;
};

export type CLIArgs = readonly string[];
export type CLIOptions = {
  [k: string]: any;
};

const templates = [
  { id: "empty", title: "Default", description: "A blank-slate Ponder app" },
  {
    id: "feature-factory",
    title: "Feature - Factory contract",
    description: "A Ponder app using a factory contract",
  },
  {
    id: "feature-accounts",
    title: "Feature - Accounts",
    description: "A Ponder app using accounts",
  },
  {
    id: "feature-filter",
    title: "Feature - Custom event filter",
    description: "A Ponder app using an event filter",
  },
  {
    id: "feature-api-functions",
    title: "Feature - Custom api functions",
    description: "A Ponder app using a custom api functions",
  },
  {
    id: "feature-blocks",
    title: "Feature - Block filter",
    description: "A Ponder app using a block filter",
  },
  {
    id: "feature-call-traces",
    title: "Feature - Call traces",
    description: "A Ponder app using a call traces",
  },
  {
    id: "feature-multichain",
    title: "Feature - Multichain contract",
    description: "A Ponder app using multiple chains",
  },
  {
    id: "feature-proxy",
    title: "Feature - Proxy contract",
    description: "A Ponder app that uses a proxy contract",
  },
  {
    id: "feature-read-contract",
    title: "Feature - Read from a contract",
    description: "A Ponder app that uses contract calls",
  },
  {
    id: "project-friendtech",
    title: "project-friendtech",
    description: "A Ponder app for Friendtech",
  },
  {
    id: "project-uniswap-v3-flash",
    title: "Project - Uniswap V3 flash loans",
    description: "A Ponder app for Uniswap V3 flash loans",
  },
  {
    id: "reference-erc20",
    title: "Reference - ERC20 token",
    description: "A Ponder app for an ERC20 token",
  },
  {
    id: "reference-erc721",
    title: "Reference - ERC721",
    description: "A Ponder app for an ERC721 token",
  },
  {
    id: "reference-erc1155",
    title: "Reference - ERC1155",
    description: "A Ponder app for an ERC1155 token",
  },
  {
    id: "reference-erc4626",
    title: "Reference - ERC4626",
    description: "A Ponder app for an ERC4626 token",
  },
] as const satisfies readonly Template[];

export async function run({
  args,
  options,
}: {
  args: CLIArgs;
  options: CLIOptions;
}) {
  if (options.help) return;

  const warnings: string[] = [];

  log();
  log(
    `Welcome to ${pico.bold(
      pico.blue("create-ponder"),
    )} – the quickest way to get started with Ponder!`,
  );
  log();

  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const templatesPath = path.join(__dirname, "..", "templates");
  let templateId = options.template || options.t;

  // Validate template if provided
  let templateValidation = await validateTemplateName({
    isNameRequired: false,
    templateId,
    templates,
  });
  if (!templateValidation.valid) throw new ValidationError(templateValidation);

  // Project name.
  let projectName: string;
  // Absolute path to project directory.
  let projectPath: string;

  if (args[0]) {
    projectPath = args[0].trim();
    // If the provided path is not absolute, make it absolute.
    if (!path.isAbsolute(projectPath)) projectPath = path.resolve(projectPath);
    const splitPath = projectPath.split(path.sep);
    // Use the last segment of the provided path as the project name.
    projectName = splitPath[splitPath.length - 1]?.trim() || "";

    const nameValidation = await validateProjectName({ projectName });
    if (!nameValidation.valid) throw new ValidationError(nameValidation);

    log(pico.green("✔"), pico.bold("Using project name:"), projectName);
  } else {
    const res = await prompts({
      initial: "my-app",
      name: "projectName",
      message: "What's the name of your project?",
      type: "text",
      async validate(projectName) {
        const validation = await validateProjectName({ projectName });
        if (!validation.valid) return validation.message;
        return true;
      },
    });
    projectName = res.projectName?.trim();
    projectPath = path.resolve(projectName);
  }

  // Validate project path
  const pathValidation = await validateProjectPath({ projectPath });
  if (!pathValidation.valid) throw new ValidationError(pathValidation);

  // After validating that the directory does not already exist, create it.
  mkdirSync(projectPath, { recursive: true });

  // Automatically set template if using shortcut.
  if (options.etherscan && !templateId) templateId = "etherscan";
  if (options.subgraph && !templateId) templateId = "subgraph";

  // Extract template ID from CLI or prompt
  if (!templateId) {
    templateId = (
      await prompts({
        name: "templateId",
        message: "Which template would you like to use?",
        type: "select",
        choices: templates.map(({ id, ...t }) => ({
          ...t,
          value: id,
        })),
      })
    ).templateId;
  }

  // Get template meta
  const templateMeta = templates.find(({ id }) => id === templateId);
  if (!templateMeta) throw new ValidationError(templateValidation);

  // Validate template name
  templateValidation = await validateTemplateName({
    templateId,
    templates,
  });
  if (!templateValidation.valid) throw new ValidationError(templateValidation);

  let config: SerializableConfig | undefined;

  log();

  // Copy template contents into the target path
  const templatePath = path.join(templatesPath, templateMeta.id);
  await cpy(path.join(templatePath, "**", "*"), projectPath, {
    rename: (name) => name.replace(/^_dot_/, "."),
  });

  if (config) {
    // Write the config file.
    const configContent = `
      import { createConfig${
        Object.values(config.contracts).some((c) => Array.isArray(c.abi))
          ? ", mergeAbis"
          : ""
      } } from "ponder";

      ${Object.values(config.contracts)
        .flatMap((c) => c.abi)
        .filter(
          (tag, index, array) =>
            array.findIndex((t) => t.dir === tag.dir) === index,
        )
        .map(
          (abi) =>
            `import {${abi.name}} from "${abi.dir.slice(0, abi.dir.length - 3)}"`,
        )
        .join("\n")}

      export default createConfig({
        chains: ${JSON.stringify(config.chains).replaceAll(
          /"process.env.PONDER_RPC_URL_(.*?)"/g,
          "process.env.PONDER_RPC_URL_$1",
        )},
        contracts: ${JSON.stringify(
          Object.entries(config.contracts).reduce<Record<string, any>>(
            (acc, [name, c]) => {
              acc[name] = {
                ...c,
                abi: Array.isArray(c.abi)
                  ? `mergeAbis([${c.abi.map((a) => a.name).join(",")}])`
                  : c.abi.name,
              };
              return acc;
            },
            {},
          ),
        ).replaceAll(/"abi":"(.*?)"/g, "abi:$1")},
      });
    `;

    writeFileSync(
      path.join(projectPath, "ponder.config.ts"),
      await prettier.format(configContent, { parser: "typescript" }),
    );

    // Write the indexing function files.
    for (const [name, contract] of Object.entries(config.contracts)) {
      // If it's an array of ABIs, use the 2nd one (the implementation ABI).
      const abi = Array.isArray(contract.abi)
        ? mergeAbis(contract.abi.map((a) => a.abi))
        : contract.abi.abi;

      const abiEvents = abi.filter(
        (item): item is AbiEvent => item.type === "event" && !item.anonymous,
      );

      const eventNamesToWrite = abiEvents
        .map((event) => event.name)
        .slice(0, 4);

      const indexingFunctionFileContents = `
      import { ponder } from 'ponder:registry'

      ${eventNamesToWrite
        .map(
          (eventName) => `
          ponder.on("${name}:${eventName}", async ({ event, context }) => {
            console.log(event.args)
          })`,
        )
        .join("\n")}
    `;

      writeFileSync(
        path.join(projectPath, "src", `${name}.ts`),
        await prettier.format(indexingFunctionFileContents, {
          parser: "typescript",
        }),
      );
    }
  }

  // Create package.json for project
  const packageJson = await fs.readJSON(path.join(projectPath, "package.json"));
  packageJson.name = projectName;
  packageJson.dependencies.ponder = `^${rootPackageJson.version}`;
  packageJson.engines = {
    bun: rootPackageJson.engines?.bun ?? ">=1.4.0",
  };

  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  await ensureBunScaffold(projectPath);

  const packageManager = getPackageManager({ options });

  // Install in background to not clutter screen
  const installArgs = [
    "install",
    packageManager === "npm" ? "--quiet" : "--silent",
  ];
  if (!options.skipInstall) {
    await oraPromise(
      execa(packageManager, installArgs, {
        cwd: projectPath,
        env: {
          ...process.env,
          ADBLOCK: "1",
          DISABLE_OPENCOLLECTIVE: "1",
          // we set NODE_ENV to development as pnpm skips dev
          // dependencies when production
          NODE_ENV: "development",
        },
      }),
      {
        text: `Installing packages with ${pico.bold(packageManager)}. This may take a few seconds.`,
        failText: "Failed to install packages.",
        successText: `Installed packages with ${pico.bold(packageManager)}.`,
      },
    );
  }

  // Create git repository
  if (!options.skipGit) {
    await oraPromise(
      async () => {
        await execa("git", ["init"], { cwd: projectPath });
        await execa("git", ["add", "."], { cwd: projectPath });
        await execa(
          "git",
          [
            "commit",
            "--no-verify",
            "--message",
            "chore: initial commit from create-ponder",
          ],
          { cwd: projectPath },
        );
      },
      {
        text: "Initializing git repository.",
        failText: "Failed to initialize git repository.",
        successText: "Initialized git repository.",
      },
    );
  }

  log();
  for (const warning of warnings) {
    log(`${pico.yellow("⚠")} ${warning}`);
  }

  log();
  log("―――――――――――――――――――――");
  log();
  log(
    `${pico.green("Success!")} Created ${pico.bold(projectName)} at ${pico.green(
      path.resolve(projectPath),
    )}`,
  );
  log();
  log(
    `To start your app, run ${pico.bold(
      pico.cyan(`cd ${path.relative(process.cwd(), projectPath)}`),
    )} and then ${pico.bold(
      pico.cyan(
        `${packageManager}${
          packageManager === "npm" || packageManager === "bun" ? " run" : ""
        } dev`,
      ),
    )}`,
  );
  log();
  log("―――――――――――――――――――――");
  log();
}

async function ensureBunScaffold(projectPath: string) {
  const bunfigPath = path.join(projectPath, "bunfig.toml");
  if (!(await fs.pathExists(bunfigPath))) {
    await fs.writeFile(
      bunfigPath,
      "# Ponder requires Bun >=1.4.0 (https://bun.sh).\n# `ponder` uses a Bun shebang, so `bun run dev` is enough — no `--bun` flag.\n",
    );
  }

  const envLocal = path.join(projectPath, ".env.local");
  const envExample = path.join(projectPath, ".env.example");
  const localExists = await fs.pathExists(envLocal);
  const exampleExists = await fs.pathExists(envExample);
  if (localExists && !exampleExists) {
    await fs.copy(envLocal, envExample);
  } else if (exampleExists && !localExists) {
    await fs.copy(envExample, envLocal);
  }
}

function isCliEntrypoint(): boolean {
  const meta = import.meta as ImportMeta & { main?: boolean };
  if (typeof meta.main === "boolean") return meta.main;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

function assertBunRuntime(): void {
  if (process.versions.bun !== undefined) return;
  process.stderr.write(
    "create-ponder requires Bun >=1.4.0. Run with `bun` (https://bun.sh).\n",
  );
  process.exit(1);
}

if (isCliEntrypoint()) {
  void (async () => {
    const cli = cac(rootPackageJson.name)
      .version(rootPackageJson.version)
      .usage(`${pico.green("<directory>")} [options]`)
      .option(
        "-t, --template [id]",
        `Use a template. Options: ${templates.map(({ id }) => id).join(", ")}`,
      )
      .option("--bun", "Use bun as your package manager (default)")
      .option("--pnpm", "Use pnpm as your package manager")
      .option("--npm", "Use npm as your package manager")
      .option("--yarn", "Use yarn as your package manager")
      .option("--skip-git", "Skip initializing a git repository")
      .option("--skip-install", "Skip installing packages")
      .help();

    assertBunRuntime();

    const { args, options } = cli.parse(process.argv);

    try {
      await run({ args, options });
      log();
      await notifyUpdate({ options });
    } catch (error) {
      log(
        error instanceof ValidationError
          ? error.message
          : pico.red((<Error>error).message),
      );
      log();
      await notifyUpdate({ options });
      process.exit(1);
    }
  })();
}
