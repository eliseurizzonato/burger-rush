(function (root) {
  'use strict';
  function read(env) { try { return env && (typeof env.save === 'string' ? JSON.parse(env.save) : env.save); } catch { return null; } }
  function plan(save, remote, expected, options) {
    const previous = read(remote), revision = remote && remote.revision || 0;
    if (Math.max(remote && remote.schemaVersion || 0, previous && previous.v || 0) > options.schema) return {status: 'newer'};
    if (remote && (!previous || !Array.isArray(previous.r)) && !options.overwrite) return {status: 'corrupt'};
    if (revision !== expected) return {status: 'conflict', remote};
    if (!save || !Array.isArray(save.r) || !Number.isFinite(save.money) || save.money < 0 || save.v !== options.schema) return {status: 'invalid'};
    const serialized = JSON.stringify(save);
    if (serialized.length > 750000) return {status: 'large'};
    return {status: 'ready', env: {save: serialized, schemaVersion: options.schema, revision: revision + 1,
      updatedAt: options.now, updatedByDevice: options.deviceId, progress: options.progress, summary: options.summary}};
  }
  root.SaveSync = {read, plan};
})(typeof window !== 'undefined' ? window : globalThis);
