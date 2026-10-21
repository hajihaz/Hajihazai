import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsProductPath, analyticsProductAction} from '../lib/analytics-traffic-path.ts';
test('HajiHaz AI analytics removes IDs and rejects private resource routes',()=>{
 for (const [input,expected] of [
  ['/','/'], ['/projects','/projects'], ['/projects/:id','/projects/:id'],
  ['/projects/12345678-1234-4234-8234-123456789abc','/projects/:id'],
  ['/share/sensitive-invite',null], ['/memory/manage',null], ['/devices',null],
  ['/profile',null], ['/tools/history',null], ['/tools','/tools'],
  ['/knowledge','/knowledge'], ['/knowledge/search',null],
  ['/projects/my-email@example.com',null], ['/projects/secret?email=x',null],
 ])assert.equal(analyticsProductPath(input),expected,input);
});
test('only approved generic product actions can be persisted',()=>{
 assert.equal(analyticsProductAction('account@example.com'),'button');
 assert.equal(analyticsProductAction('button'),'button');
 assert.equal(analyticsProductAction('project-link'),'project-link');
});
