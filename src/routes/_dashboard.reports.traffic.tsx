import { createFileRoute } from "@tanstack/react-router";
import { TrafficAnalysis } from "@/components/dashboard/TrafficAnalysis";

export const Route = createFileRoute("/_dashboard/reports/traffic")({
  component: TrafficAnalysis,
});