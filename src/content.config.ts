import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    lessonNumber: z.number(),
    lessonCode: z.string().optional(),
    stage: z.number(),
    stageName: z.string(),
    title: z.string(),
    subtitle: z.string(),
    readMinutes: z.number(),
    quantFocus: z.array(z.string()),
    labName: z.string(),
    rustChapterSlug: z.string().optional(),
    rustChapterTitle: z.string().optional(),
  }),
});

const rustChapters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/rust-chapters' }),
  schema: z.object({
    chapterNumber: z.number(),
    chapterCode: z.string(),
    part: z.number(),
    partName: z.string(),
    title: z.string(),
    subtitle: z.string(),
    readMinutes: z.number(),
    rustConcepts: z.array(z.string()),
    engineeringGoal: z.string(),
    quantLessonSlug: z.string().optional(),
    quantLessonTitle: z.string().optional(),
  }),
});

export const collections = { lessons, rustChapters };
