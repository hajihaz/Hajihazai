import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsProductPath, analyticsProductAction,analyticsTrustedOrigin} from '../lib/analytics-traffic-path.ts';
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

test('analytics rejects missing, downgraded, malformed and cross-origin requests',()=>{
 const target='https://ai.hajihaz.example/api/analytics/visit';
 assert.equal(analyticsTrustedOrigin('https://ai.hajihaz.example',target),true);
 for(const input of [null,'null','', 'http://ai.hajihaz.example',
  'https://ai.hajihaz.example.attacker.test',
  'https://ai.hajihaz.example:8443','https://other.example',
  'https://ai.hajihaz.example/path','bad-url'])
  assert.equal(analyticsTrustedOrigin(input,target),false,String(input));
 assert.equal(analyticsTrustedOrigin('http://localhost:3000','http://localhost:3000/api/analytics/visit'),true);
 assert.equal(analyticsTrustedOrigin('http://127.0.0.1:3000','http://127.0.0.1:3000/api/analytics/visit'),true);
 assert.equal(analyticsTrustedOrigin('http://hajihaz.example','http://hajihaz.example/api/analytics/visit'),false);
});
