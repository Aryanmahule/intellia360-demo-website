
"use client";

import React from "react";

interface GradeSelectorProps {
  currentGrade?: string;
  onChangeGrade?: (grade: string) => void;
}

export default function GradeSelector({
  currentGrade = "grade1",
  onChangeGrade,
}: GradeSelectorProps) {

  // All grades from Grade 1 to Grade 12
  const grades = Array.from({ length: 12 }, (_, index) => ({
    id: `grade${index + 1}`,
    label: `Grade ${index + 1} Math`,
  }));

  // Display the currently selected grade
  const currentLabel =
    grades.find((grade) => grade.id === currentGrade)?.label ||
    "Select Grade";

  return (
    <div
      className="grade-selector"
      style={{ position: "relative" }}
    >
      <select
        value={currentGrade}
        onChange={(e) => onChangeGrade?.(e.target.value)}
        aria-label="Select your mathematics grade"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
        }}
      >
        {grades.map((grade) => (
          <option key={grade.id} value={grade.id}>
            {grade.label}
          </option>
        ))}
      </select>

      <span className="grade-text">
        {currentLabel}
      </span>

      <span className="grade-arrow">
        ▾
      </span>
    </div>
  );
}
