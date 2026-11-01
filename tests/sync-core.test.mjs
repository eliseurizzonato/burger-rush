import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const scope = vm.createContext({});
vm.runInContext(readFileSync(new URL('../www/sync-core.js', import.meta.url), 'utf8'), scope);
const {SaveSync} = scope, save = {v: 8, money: 100, r: [{}], enterprise: {inventory: {tomato: 5}}, journey: {collection: ['chef']}};
const options = {schema: 8, now: 1000, deviceId: 'test', progress: 5, summary: 'Teste'};
test('dois escritores não avançam a mesma revisão sem conflito', () => {
  const first = SaveSync.plan(save, null, 0, options);
  assert.equal(first.status, 'ready'); assert.equal(first.env.revision, 1);
  const second = SaveSync.plan({...save, money: 20}, first.env, 0, options);
  assert.equal(second.status, 'conflict');
  assert.equal(SaveSync.read(first.env).money, 100);
});
test('save futuro nunca é substituído mesmo com manter local', () => {
  const remote = {revision: 9, schemaVersion: 9, save: JSON.stringify({...save, v: 9})};
  assert.equal(SaveSync.plan(save, remote, 9, {...options, overwrite: true}).status, 'newer');
});
test('manter local exige a revisão que o usuário realmente revisou', () => {
  const remote = {revision: 3, schemaVersion: 8, save: JSON.stringify(save)};
  assert.equal(SaveSync.plan(save, remote, 2, {...options, overwrite: true}).status, 'conflict');
  assert.equal(SaveSync.plan(save, remote, 3, {...options, overwrite: true}).status, 'ready');
});
test('envelope guarda os novos sistemas sem combinar identidades ou alterar a origem', () => {
  const before = JSON.stringify(save), result = SaveSync.plan(save, null, 0, options);
  assert.equal(JSON.stringify(save), before);
  assert.equal(SaveSync.read(result.env).enterprise.inventory.tomato, 5);
  assert.equal(SaveSync.read(result.env).journey.collection[0], 'chef');
});
test('corrupção, NaN e tamanho excessivo são bloqueados antes de gravar', () => {
  assert.equal(SaveSync.plan(save, {save: 'invalid', revision: 1}, 1, options).status, 'corrupt');
  assert.equal(SaveSync.plan({...save, money: NaN}, null, 0, options).status, 'invalid');
  assert.equal(SaveSync.plan({...save, large: 'x'.repeat(760000)}, null, 0, options).status, 'large');
});
