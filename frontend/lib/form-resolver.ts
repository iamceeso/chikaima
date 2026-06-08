import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";

export function createFormResolver<TValues>(schema: unknown): Resolver<TValues> {
  return zodResolver(schema as never) as Resolver<TValues>;
}
