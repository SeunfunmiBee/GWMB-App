import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Run the pure builder rules without loading React Native or a live API.
const root = path.resolve(import.meta.dirname, '..');
function load(file, imports = {}) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (id) => {
    if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`);
    return imports[id];
  });
  return exports;
}
const data = load('src/data/courses.ts');
const { blank, editableMeta, publicationIssues } = load('src/lib/education-builder.ts', {
  '@/data/courses': data,
});

test('incomplete drafts are allowed, but publishing requires lessons and course details', () => {
  const draft = blank('course');
  assert.deepEqual(publicationIssues('course', draft, draft.metadata), []);
  const issues = publicationIssues('course', { ...draft, status: 'published' }, draft.metadata);
  assert.ok(issues.includes('At least one lesson'));
  assert.ok(issues.includes('Cover image'));
  assert.ok(issues.includes('Lecturer name'));
});

test('publishing catches duplicate lesson IDs and missing lesson content', () => {
  const draft = blank('course');
  const lesson = { id: 'same-id', title: 'Lesson', summary: 'Summary', duration: '5 min', media_type: 'none', media_url: '', sections: [] };
  const issues = publicationIssues('course', { ...draft, status: 'published' }, {
    ...draft.metadata, lessons: [lesson, lesson],
  });
  assert.ok(issues.includes('Unique lesson IDs'));
  assert.ok(issues.includes('Lesson 1 needs complete notes or media'));
});

test('seeded lesson counts resolve to editable lessons and malformed lists are repairable', () => {
  const [slug, course] = Object.entries(data.courses).find(([, course]) => course.lessons.length);
  const meta = editableMeta({ area: 'courses', slug, metadata: { lessons: course.lessons.length, resources: null, surfaces: 'learn' } });
  assert.equal(meta.lessons.length, course.lessons.length);
  assert.equal(meta.lessons[0].id, course.lessons[0].id);
  assert.ok(Array.isArray(meta.resources));
  assert.deepEqual(meta.surfaces, []);
});
