import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { NAME } from "@/components/landing/name";
import "./landing.css";

export const metadata: Metadata = {
  title: `${NAME}: read anything with a scholar in the margin`,
  alternates: { canonical: "/" },
};

export default function Home() {
  return <Landing />;
}
