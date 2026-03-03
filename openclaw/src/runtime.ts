// Store the OpenClaw runtime reference for use across the plugin.
// Set once during register(), accessed by gateway/inbound code.

let _runtime: any = null;

export function setMeepchatRuntime(runtime: any): void {
  _runtime = runtime;
}

export function getMeepchatRuntime(): any {
  if (!_runtime) {
    throw new Error(
      "MeepaChat runtime not initialized — plugin not registered"
    );
  }
  return _runtime;
}
