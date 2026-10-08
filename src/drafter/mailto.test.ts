import { describe, expect, it } from "vitest";
import { copiedText, mailtoHref } from "./mailto";

describe("mailtoHref", () => {
  it("addresses the email and carries the subject and message, percent-encoded with line breaks as CRLF", () => {
    expect(mailtoHref("jo@example.com", { subject: "Enquiry about therapy", message: "Hello Jo,\n\nThanks & bye" })).toBe(
      "mailto:jo@example.com?subject=Enquiry%20about%20therapy&body=Hello%20Jo%2C%0D%0A%0D%0AThanks%20%26%20bye",
    );
  });

  it("encodes what a query would read as its own: plus, hash and percent, and an emoji as its UTF-8 bytes", () => {
    expect(mailtoHref("jo@example.com", { subject: "C++ #1", message: "100% 🙂" })).toBe(
      "mailto:jo@example.com?subject=C%2B%2B%20%231&body=100%25%20%F0%9F%99%82",
    );
  });

  it("leaves a line break that is already CRLF as one", () => {
    expect(mailtoHref("jo@example.com", { subject: "Hi", message: "a\r\nb" })).toBe("mailto:jo@example.com?subject=Hi&body=a%0D%0Ab");
  });

  it("writes half an emoji, as cutting a draft to its limit can leave, as the replacement character rather than failing", () => {
    const half = "🙂".slice(0, 1);
    expect(mailtoHref("jo@example.com", { subject: `Hi ${half}`, message: `${"🙂".slice(1)}Bye ${half}` })).toBe(
      "mailto:jo@example.com?subject=Hi%20%EF%BF%BD&body=%EF%BF%BDBye%20%EF%BF%BD",
    );
  });
});

describe("copiedText", () => {
  it("puts the subject before the message", () => {
    expect(copiedText({ subject: "Enquiry about therapy", message: "Hello Jo," })).toBe("Subject: Enquiry about therapy\n\nHello Jo,");
  });
});
