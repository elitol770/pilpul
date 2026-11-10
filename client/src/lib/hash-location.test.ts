import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, Route, Router, Switch } from "wouter";
import { describe, expect, it } from "vitest";
import { useHashPathLocation } from "./hash-location";

function renderPath(path: string) {
  return renderToStaticMarkup(
    h(
      Router,
      { hook: useHashPathLocation, ssrPath: path },
      h(
        Switch,
        null,
        h(Route, { path: "/" }, "home"),
        h(Route, { path: "/auth/callback" }, "verify token"),
        h(Route, { path: "/invite/:token" }, "invitation"),
        h(Route, null, "not found"),
      ),
      h(Link, { href: "/sign-in" }, "Sign in"),
    ),
  );
}

describe("fragment route matching", () => {
  it("routes a token-bearing magic link to the callback instead of the fallback", () => {
    const html = renderPath("/auth/callback?token=example%2Btoken");
    expect(html).toContain("verify token");
    expect(html).not.toContain("not found");
    expect(html).toContain('href="#/sign-in"');
  });

  it("keeps normal home, callback, invite and unknown routing", () => {
    expect(renderPath("/")).toContain("home");
    expect(renderPath("/auth/callback")).toContain("verify token");
    expect(renderPath("/invite/example?mode=preview")).toContain("invitation");
    expect(renderPath("/auth/callback-extra?token=example")).toContain("not found");
  });
});
