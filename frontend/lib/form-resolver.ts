import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";

export function createFormResolver<TValues extends FieldValues>(schema: unknown): Resolver<TValues> {
  return zodResolver(schema as never) as Resolver<TValues>;
}
