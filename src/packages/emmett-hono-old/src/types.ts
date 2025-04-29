import type { Hono } from 'hono';

// Defines the function signature for setting up API routes on a Hono router instance.
export type WebApiSetup = (router: Hono) => void;

// Define other shared types here as needed later.
