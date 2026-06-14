import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WeeklyPlanner from "./WeeklyPlanner.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WeeklyPlanner />
  </StrictMode>
);
