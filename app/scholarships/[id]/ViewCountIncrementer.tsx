"use client";

import { useEffect } from "react";
import { incrementScholarshipViewCount } from "./actions";

export default function ViewCountIncrementer({
  scholarshipId,
}: {
  scholarshipId: number;
}) {
  useEffect(() => {
    void incrementScholarshipViewCount(scholarshipId);
  }, [scholarshipId]);

  return null;
}
