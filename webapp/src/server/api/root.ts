import { jobsRouter } from "~/server/api/routers/jobs";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * Primary router for the AirData Grafana webapp.
 */
export const appRouter = createTRPCRouter({
  jobs: jobsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
