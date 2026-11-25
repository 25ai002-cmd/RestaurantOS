#!/usr/bin/env node
/**
 * RestaurantOS — Unified Start Server Launcher
 *
 * Usage:
 *   node start-server.js          # Starts API + Web dev servers concurrently
 *   node start-server.js --prod   # Starts compiled API server (and optional static preview)
 *   node start-server.js --api    # Starts API server only
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const isProd = args.has('--prod');
const apiOnly = args.has('--api');

const rootDir = __dirname;
const apiDir = path.join(rootDir, 'apps', 'api');
const webDir = path.join(rootDir, 'apps', 'web');

function ensureEnvFile(dir, exampleName = '.env.example', targetName = '.env') {
  const target = path.join(dir, targetName);
  const example = path.join(dir, exampleName);
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target);
    console.log(`[start-server] Created ${path.relative(rootDir, target)} from ${exampleName}`);
  }
}

ensureEnvFile(apiDir);
ensureEnvFile(webDir);

const children = [];

function launch(name, command, cmdArgs, cwd) {
  const isWin = process.platform === 'win32';
  const child = spawn(isWin ? 'cmd.exe' : command, isWin ? ['/c', command, ...cmdArgs] : cmdArgs, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });

  children.push(child);
  return child;
}

function shutdown(signal) {
  console.log(`\n[start-server] Received ${signal}. Shutting down services...`);
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('==============================================');
console.log(`  RestaurantOS Server (${isProd ? 'PRODUCTION' : 'DEVELOPMENT'})`);
console.log('==============================================');

if (isProd) {
  launch('api', 'npm', ['run', 'start'], apiDir);
} else {
  launch('api', 'npm', ['run', 'dev'], apiDir);
  if (!apiOnly) {
    launch('web', 'npm', ['run', 'dev'], webDir);
  }
}
