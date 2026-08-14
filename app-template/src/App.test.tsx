import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("neutral application seed", () => {
  it("renders an accessible starting point", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Ready to build" })).toBeInTheDocument();
  });
});
