"use client";

import React, { useState } from "react";
import "./demo-lessons.css";

const DEMO_LESSONS = [
  {
    id: "algebric-patterns-and-word-expressions",
    title: "Algebraic Patterns & Word Expressions",
    grade: "Grade 8",
    description: "Explore patterns and translate word problems into algebraic expressions.",
    url: "https://d423jcr86hgq5.cloudfront.net/algebric-patterns-and-word-expressions/",
    emoji: "🔢",
  },
  {
    id: "bracket-equations",
    title: "Bracket Equations",
    grade: "Grade 8",
    description: "Solve equations involving brackets and learn to expand expressions.",
    url: "https://d423jcr86hgq5.cloudfront.net/bracket-equations/",
    emoji: "🧮",
  },
  {
    id: "g8-rates",
    title: "Rates",
    grade: "Grade 8",
    description: "Understand and calculate rates in real-world problems.",
    url: "https://d423jcr86hgq5.cloudfront.net/g8-rates/",
    emoji: "⚡",
  },
  {
    id: "g8-ratios-in-real-world-problems",
    title: "Ratios in Real World Problems",
    grade: "Grade 8",
    description: "Apply ratio concepts to solve practical real-world problems.",
    url: "https://d423jcr86hgq5.cloudfront.net/g8-ratios-in-real-world-problems/",
    emoji: "📊",
  },
  {
    id: "justify-solutions-mathematical-reasoning",
    title: "Mathematical Reasoning & Communication",
    grade: "Grade 8",
    description: "Learn to justify solutions and communicate mathematical thinking.",
    url: "https://d423jcr86hgq5.cloudfront.net/justify-solutions-mathematical-reasoning/",
    emoji: "💡",
  },
  {
    id: "one-step-equations",
    title: "One Step Equations",
    grade: "Grade 8",
    description: "Solve one-step equations using inverse operations.",
    url: "https://d423jcr86hgq5.cloudfront.net/one-step-equations/",
    emoji: "➕",
  },
  {
    id: "substitution-and-formulae",
    title: "Substitution and Formulae",
    grade: "Grade 8",
    description: "Substitute values into formulae and evaluate algebraic expressions.",
    url: "https://d423jcr86hgq5.cloudfront.net/substitution-and-formulae/",
    emoji: "🔀",
  },
  {
    id: "probability-theoretical-vs-experimental",
    title: "Theoretical vs Experimental Probability",
    grade: "Grade 8",
    description: "Compare theoretical and experimental probability through activities.",
    url: "https://d423jcr86hgq5.cloudfront.net/probability-theoretical-vs-experimental/",
    emoji: "🎲",
  },
  {
    id: "understanding-equations",
    title: "Understanding Equations",
    grade: "Grade 8",
    description: "Build a solid foundation in understanding and solving equations.",
    url: "https://d423jcr86hgq5.cloudfront.net/understanding-equations/",
    emoji: "📐",
  },
];

export default function DemoLessonsPage() {
  const [activeLesson, setActiveLesson] = useState<(typeof DEMO_LESSONS)[0] | null>(null);

  return (
    <main className="demo-lessons-page">
      <div className="demo-lessons-inner">

        {/* Header */}
        <div className="demo-lessons-header">
          <span className="demo-lessons-eyebrow">AWS CLOUD HOSTED</span>
          <h1 className="demo-lessons-title">Demo Lessons</h1>
          <p className="demo-lessons-subtitle">
            These interactive lessons are hosted on AWS CloudFront. Click any lesson to launch it.
          </p>
        </div>

        {/* Lesson viewer */}
        {activeLesson && (
          <div className="demo-lesson-viewer">
            <div className="demo-lesson-viewer-header">
              <div className="demo-lesson-viewer-info">
                <span className="demo-lesson-viewer-emoji">{activeLesson.emoji}</span>
                <div>
                  <h2 className="demo-lesson-viewer-title">{activeLesson.title}</h2>
                  <span className="demo-lesson-viewer-grade">{activeLesson.grade}</span>
                </div>
              </div>
              <button
                type="button"
                className="demo-lesson-close-btn"
                onClick={() => setActiveLesson(null)}
                aria-label="Close lesson"
              >
                ✕ Close
              </button>
            </div>
            <iframe
              key={activeLesson.id}
              src={activeLesson.url}
              title={activeLesson.title}
              className="demo-lesson-iframe"
              allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}

        {/* Lesson grid */}
        <div className="demo-lessons-grid">
          {DEMO_LESSONS.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className={`demo-lesson-card ${activeLesson?.id === lesson.id ? "is-active" : ""}`}
              onClick={() => setActiveLesson(lesson)}
            >
              <div className="demo-lesson-card-emoji">{lesson.emoji}</div>
              <div className="demo-lesson-card-body">
                <span className="demo-lesson-card-grade">{lesson.grade}</span>
                <h3 className="demo-lesson-card-title">{lesson.title}</h3>
                <p className="demo-lesson-card-desc">{lesson.description}</p>
              </div>
              <div className="demo-lesson-card-footer">
                <span className="demo-lesson-card-launch">
                  {activeLesson?.id === lesson.id ? "▶ Playing" : "Launch →"}
                </span>
              </div>
            </button>
          ))}
        </div>

      </div>
    </main>
  );
}
