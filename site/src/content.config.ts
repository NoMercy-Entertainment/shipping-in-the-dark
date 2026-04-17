import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const entries = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
	schema: z.object({
		title: z.string(),
		slug: z.string(),
		date: z.coerce.date(),
		session_start: z.string().optional(),
		session_end: z.string().optional(),
		duration_minutes: z.number().optional(),
		status: z.string().optional(),
		severity: z.string().optional(),
		type: z.string().optional(),
		projects: z.array(z.string()).optional(),
		components: z.array(z.string()).optional(),
		agents: z.array(z.string()).optional(),
		human_mood: z.string().optional(),
		commits: z.array(z.object({
			message: z.string(),
			repo: z.string(),
		})).optional(),
		related_entries: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional(),
		series: z.object({
			name: z.string(),
			part: z.number(),
		}).optional(),
		author: z.string().optional(),
		difficulty: z.string().optional(),
		reading_time_minutes: z.number().optional(),
		excerpt: z.string().optional(),
		audio_url: z.string().optional(),
		vtt_url: z.string().optional(),
	}),
});

const agents = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/agents' }),
	schema: z.object({
		id: z.string(),
		employee_id: z.string().optional(),
		display_name: z.string(),
		full_title: z.string().default(''),
		tagline: z.string().default(''),
		avatar_emoji: z.string().default('🤖'),
		pronouns: z.string().default('they/them'),
		personality: z.array(z.string()).default([]),
		hire_date: z.coerce.date().optional(),
		owns: z.array(z.string()).optional(),
		model: z.string().default('sonnet'),
		anonymous: z.boolean().optional(),
		audio_url: z.string().optional(),
		vtt_url: z.string().optional(),
	}),
});

const reports = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/reports' }),
	schema: z.object({
		title: z.string(),
		part: z.number(),
	}),
});

export const collections = { entries, agents, reports };
