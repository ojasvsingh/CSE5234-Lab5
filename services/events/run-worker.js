export async function runWorker(name, tick, close) {
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopping = true; });
  console.log(`${name} started.`);
  let lastError = false;
  try {
    while (!stopping) {
      try {
        await tick();
        lastError = false;
      } catch {
        if (!lastError) console.error(`${name}: retry pending; check service/database configuration.`);
        lastError = true;
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { await close(); }
}
