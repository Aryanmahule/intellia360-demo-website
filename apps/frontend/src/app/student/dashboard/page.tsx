"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  Flame,
  Gem,
  Orbit,
  Play,
  Star,
  Target,
  Video,
} from "lucide-react";
import { useStudentContext } from "@/context/StudentContext";
import HeroSectionContainer from "@/components/student/HeroSectionContainer";
import type { DashboardHeroSlide } from "@intellia360/shared/types/student";
import BottomNavigationContainer from "@/components/student/BottomNavigationContainer";
import "./dashboard.css";

function StatCard({
  icon,
  label,
  value,
  change,
  iconBg,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  change: string;
  iconBg: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-card__top">
        <div className="stat-card__icon" style={{ background: iconBg }}>
          {icon}
        </div>
        <div className="stat-card__content">
          <span className="stat-card__label">{label}</span>
          <strong className="stat-card__value">{value}</strong>
        </div>
      </div>
      <span className="stat-card__change">↑ {change}</span>
    </article>
  );
}

function ResourceCard({
  icon,
  title,
  description,
  buttonText,
  href,
  background,
  iconBackground,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  buttonText: string;
  href: string;
  background: string;
  iconBackground: string;
  onClick: () => void;
}) {
  return (
    <article className="resource-card" style={{ background }}>
      <div className="resource-card__decor" />
      <div className="resource-card__content">
        <div className="resource-card__icon" style={{ background: iconBackground }}>
          {icon}
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <Link className="resource-card__button" href={href} onClick={onClick}>
        {buttonText} <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const percentage = Math.min(100, Math.round((completed / safeTotal) * 100));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dash = (percentage / 100) * circumference;

  return (
    <div className="progress-ring" aria-label={`${percentage}% completed`}>
      <svg width="125" height="125" viewBox="0 0 125 125" aria-hidden="true">
        <defs>
          <linearGradient id="dashboardProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <circle className="progress-ring__track" cx="62.5" cy="62.5" r={radius} fill="none" />
        <circle
          className="progress-ring__value"
          cx="62.5"
          cy="62.5"
          r={radius}
          fill="none"
          stroke="url(#dashboardProgressGradient)"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 62.5 62.5)"
        />
      </svg>
      <div className="progress-ring__label">
        <strong>{percentage}%</strong>
        <span>{completed}/{safeTotal}</span>
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  const {
    activeLessonData,
    goToNextLesson,
    goToPrevLesson,
    completeActivity,
    isActivityCompleted,
    xpPoints,
    learningGems,
    streakDays,
    completedLessons,
    curriculum,
  } = useStudentContext();

  if (!activeLessonData) {
    return <div className="dashboard-loading">Loading dashboard…</div>;
  }

  const actionCards = activeLessonData.actionCards ?? {};
  const architectureUrl = `/student/lesson/${encodeURIComponent(activeLessonData.id)}`;
  const edunotesUrl = `/student/lesson/edunotes?lessonId=${encodeURIComponent(activeLessonData.id)}`;
  const practiceUrl = actionCards.practice ?? "/student/quiz/practice-1";
  const videoUrl = "/student/lesson/video?lessonId=" + encodeURIComponent(activeLessonData.id);

  const isArchCompleted = isActivityCompleted(activeLessonData.id, "architecture");
  const isPracticeCompleted = isActivityCompleted(activeLessonData.id, "practice");
  const isEdunotesCompleted = isActivityCompleted(activeLessonData.id, "edunotes");
  const isVideoCompleted = isActivityCompleted(activeLessonData.id, "video");
  const isLessonCompleted = completedLessons.includes(activeLessonData.id);

  const xpAward = activeLessonData.xpReward ?? 50;
  const gemAward = activeLessonData.gemsReward ?? 5;

  const completedCount = [
    isArchCompleted,
    isPracticeCompleted,
    isEdunotesCompleted,
    isVideoCompleted,
  ].filter(Boolean).length;

  const completionPct = Math.round((completedCount / 4) * 100);

  const totalTopics =
    curriculum?.chapters.reduce(
      (total, chapter) => total + chapter.topics.length,
      0
    ) ?? 0;

  const currentLessonCompletedTopics =
    curriculum?.chapters.reduce(
      (total, chapter) =>
        total +
        chapter.topics.filter((topic) => completedLessons.includes(topic.id)).length,
      0
    ) ?? completedLessons.length;

  const heroSlides: DashboardHeroSlide[] = [
    {
      tag: activeLessonData.heroSlide?.tag || "Today's Adventure",
      title: activeLessonData.title,
      subtitle:
        activeLessonData.heroSlide?.subtitle ||
        `Dive into ${activeLessonData.title}! Discover core concepts through interactive visuals and step-by-step guided learning designed just for you.`,
      ctaText: isArchCompleted ? "Continue Learning →" : "Start Learning →",
      ctaUrl: architectureUrl,
      visualizerKey: activeLessonData.heroSlide?.visualizerKey || activeLessonData.id,
      visualizerData: activeLessonData.heroSlide?.visualizerData || { number: 123 },
      activityType: "architecture",
      xpReward: xpAward,
      gemsReward: gemAward,
    },
    {
      tag: "Story & Interactive Simulation",
      title: "Learn Visually",
      subtitle:
        "Understand concepts through interactive 3D models, stories, examples and guided exploration.",
      ctaText: isArchCompleted ? "Open 3D Architecture ✓" : "Explore Architecture 3D",
      ctaUrl: architectureUrl,
      visualizerKey: "symmetry",
      visualizerData: activeLessonData.heroSlide?.visualizerData || { number: 246 },
      activityType: "architecture",
      xpReward: xpAward,
      gemsReward: gemAward,
    },
    {
      tag: "Practice Challenge",
      title: "Practice & Improve",
      subtitle:
        "Test your knowledge with interactive questions, instant feedback and reward-based practice.",
      ctaText: isPracticeCompleted ? "Practice Again ✓" : "Start Practice (+30 XP)",
      ctaUrl: practiceUrl,
      visualizerKey: "fraction",
      visualizerData: { number: 456 },
      activityType: "practice",
      xpReward: 30,
      gemsReward: 0,
    },
    {
      tag: "Reflection & Achievement",
      title: "Review Your Learning",
      subtitle: `You have completed ${completedCount} of 4 activities for this lesson. Keep learning and build your streak!`,
      ctaText: isEdunotesCompleted ? "Open EduNotes ✓" : "Open EduNotes",
      ctaUrl: edunotesUrl,
      visualizerKey: "time",
      visualizerData: { number: 789 },
      activityType: "edunotes",
      xpReward: 20,
      gemsReward: 0,
    },
  ];

  const handleHeroCtaClick = (slide: DashboardHeroSlide) => {
    if (!slide.activityType) return;
    completeActivity(
      activeLessonData.id,
      slide.activityType,
      slide.xpReward || 0,
      slide.gemsReward || 0
    );
  };

  const handleResourceClick = (
    activityType: string,
    xpReward: number,
    gemsReward: number
  ) => {
    completeActivity(activeLessonData.id, activityType, xpReward, gemsReward);
  };

  const upcomingActivities = [
    {
      icon: <BookOpen size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: `Complete ${activeLessonData.title}`,
      subtitle: isLessonCompleted ? "Lesson completed" : `${completedCount}/4 activities completed`,
      href: architectureUrl,
      action: isLessonCompleted ? "Review" : "Start",
    },
    {
      icon: <Target size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: "Practice Challenge",
      subtitle: isPracticeCompleted ? "Completed" : "Interactive exercises",
      href: practiceUrl,
      action: isPracticeCompleted ? "Retry" : "Start",
    },
    {
      icon: <Play size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: "Watch Lesson Video",
      subtitle: isVideoCompleted ? "Completed" : "Learn with video",
      href: videoUrl,
      action: "Watch",
    },
  ];

  const achievements = [
    {
      icon: <Flame size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: `${streakDays}-Day Streak`,
      subtitle: streakDays > 0 ? "Keep the streak alive!" : "Start your streak today",
    },
    {
      icon: <Star size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: `${xpPoints.toLocaleString()} XP`,
      subtitle: "Total learning XP",
    },
    {
      icon: <Gem size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: `${learningGems} Gems`,
      subtitle: "Learning rewards collected",
    },
  ];

  return (
    <div className="student-dashboard-page">
      <section className="dashboard-hero" aria-label="Current lesson">
        <HeroSectionContainer
          key={activeLessonData.id}
          slides={heroSlides}
          activeLessonId={activeLessonData.id}
          onCtaClick={handleHeroCtaClick}
        />
      </section>

      <section className="student-dashboard-stats-grid" aria-label="Student statistics">
        <StatCard icon={<Star size={21} strokeWidth={1.8} aria-hidden="true" />} label="XP Points" value={xpPoints.toLocaleString()} change="Keep learning" iconBg="#fef3c7" />
        <StatCard icon={<Gem size={21} strokeWidth={1.8} aria-hidden="true" />} label="Learning Gems" value={String(learningGems)} change="Rewards collected" iconBg="#f3e8ff" />
        <StatCard icon={<Flame size={21} strokeWidth={1.8} aria-hidden="true" />} label="Day Streak" value={`${streakDays}`} change="Consecutive days" iconBg="#ffedd5" />
        <StatCard icon={<CheckCircle2 size={21} strokeWidth={1.8} aria-hidden="true" />} label="Lessons Completed" value={String(completedLessons.length)} change={`${totalTopics || 0} topics available`} iconBg="#dcfce7" />
      </section>

      <section className="student-dashboard-progress-grid">
        <article className="dashboard-card continue-card">
          <div className="dashboard-card__header">
            <div>
              <span className="section-eyebrow">Your journey</span>
              <h2>Continue Learning</h2>
            </div>
            <span className="completion-pill">{completionPct}% complete</span>
          </div>

          <div className="continue-card__body">
            <div className="lesson-visual" aria-hidden="true">
              <Orbit size={52} strokeWidth={1.5} />
            </div>
            <div className="continue-card__details">
              <span className="muted-label">Current Lesson</span>
              <h3>{activeLessonData.title}</h3>
              <p>
                {isLessonCompleted
                  ? "Great work! You completed this lesson."
                  : "Continue the lesson and explore the learning resources below."}
              </p>
              <div className="progress-bar" aria-label={`${completionPct}% of lesson activities completed`}>
                <div className="progress-bar__fill" style={{ width: `${completionPct}%` }} />
              </div>
              <div className="continue-card__footer">
                <span>{completedCount}/4 activities</span>
                <Link
                  className="btn-primary"
                  href={architectureUrl}
                  onClick={() => handleResourceClick("architecture", xpAward, gemAward)}
                >
                  Continue Lesson <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </article>

        <article className="dashboard-card progress-card">
          <div className="dashboard-card__header">
            <div>
              <span className="section-eyebrow">Curriculum</span>
              <h2>Learning Progress</h2>
            </div>
            <Link href="/student/courses" className="text-link">View All</Link>
          </div>

          <div className="progress-card__body">
            <ProgressRing completed={currentLessonCompletedTopics} total={totalTopics} />
            <div className="progress-card__stats">
              <div>
                <div className="progress-stat-row">
                  <span>Completed</span>
                  <strong>{currentLessonCompletedTopics}</strong>
                </div>
                <div className="mini-progress">
                  <div
                    className="mini-progress__fill"
                    style={{
                      width: `${totalTopics ? Math.min(100, Math.round((currentLessonCompletedTopics / totalTopics) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <p>
                {totalTopics
                  ? `${Math.max(0, totalTopics - currentLessonCompletedTopics)} topics remaining in the curriculum.`
                  : "Your curriculum is loading."}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="student-dashboard-learning-hub dashboard-card">
        <div className="dashboard-card__header learning-hub__header">
          <div>
            <span className="section-eyebrow">Learning Hub</span>
            <h2>Learning Tools & Resources</h2>
            <p>Everything you need for {activeLessonData.title} in one place.</p>
          </div>
          <span className="completion-pill">{completedCount}/4 completed</span>
        </div>

        <div className="learning-hub__grid">
          <ResourceCard
            icon={<Box size={26} strokeWidth={1.7} aria-hidden="true" />}
            title="Architecture 3D"
            description="Explore interactive 3D models and visual concept breakdowns."
            buttonText={isArchCompleted ? "Open 3D Viewer ✓" : "Open 3D Viewer"}
            href={architectureUrl}
            background="linear-gradient(135deg, #1687f7 0%, #2563eb 55%, #4f46e5 100%)"
            iconBackground="rgba(255,255,255,.16)"
            onClick={() => handleResourceClick("architecture", xpAward, gemAward)}
          />
          <ResourceCard
            icon={<Video size={26} strokeWidth={1.7} aria-hidden="true" />}
            title="Video Lessons"
            description="Watch engaging concept videos and learn through visual examples."
            buttonText="Watch Video"
            href={videoUrl}
            background="linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a855f7 100%)"
            iconBackground="rgba(255,255,255,.16)"
            onClick={() => handleResourceClick("video", 20, 5)}
          />
          <ResourceCard
            icon={<BookOpen size={26} strokeWidth={1.7} aria-hidden="true" />}
            title="EduNotes"
            description="Read clear notes, key points, summaries and lesson explanations."
            buttonText={isEdunotesCompleted ? "Open EduNotes ✓" : "Open EduNotes"}
            href={edunotesUrl}
            background="linear-gradient(135deg, #0f9f7a 0%, #10b981 50%, #14b8a6 100%)"
            iconBackground="rgba(255,255,255,.16)"
            onClick={() => handleResourceClick("edunotes", 20, 0)}
          />
          <ResourceCard
            icon={<Target size={26} strokeWidth={1.7} aria-hidden="true" />}
            title="Practice"
            description="Solve interactive questions, get instant feedback and improve skills."
            buttonText={isPracticeCompleted ? "Practice Again ✓" : "Start Practice"}
            href={practiceUrl}
            background="linear-gradient(135deg, #f97316 0%, #fb923c 55%, #f59e0b 100%)"
            iconBackground="rgba(255,255,255,.16)"
            onClick={() => handleResourceClick("practice", 30, 0)}
          />
        </div>
      </section>

      <section className="student-dashboard-bottom-grid">
        <article className="dashboard-card compact-card">
          <div className="dashboard-card__header">
            <h2>Upcoming Activities</h2>
            <Link href="/student/assignments" className="text-link">View All</Link>
          </div>
          <div className="activity-list">
            {upcomingActivities.map((activity) => (
              <Link key={activity.title} href={activity.href} className="activity-item">
                <span className="activity-item__icon">{activity.icon}</span>
                <span className="activity-item__content">
                  <strong>{activity.title}</strong>
                  <small>{activity.subtitle}</small>
                </span>
                <span className="activity-item__action">{activity.action}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="dashboard-card compact-card">
          <div className="dashboard-card__header">
            <h2>Recent Achievements</h2>
            <Link href="/student/rewards" className="text-link">View All</Link>
          </div>
          <div className="achievement-list">
            {achievements.map((achievement) => (
              <div key={achievement.title} className="achievement-item">
                <span className="achievement-item__icon">{achievement.icon}</span>
                <span>
                  <strong>{achievement.title}</strong>
                  <small>{achievement.subtitle}</small>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-card summary-card">
          <span className="section-eyebrow">Your Journey</span>
          <h2>Your Learning Summary</h2>
          <p>A quick snapshot of your current learning journey.</p>
          <div className="summary-list">
            <div><span>Current lesson</span><strong title={activeLessonData.title}>{activeLessonData.title}</strong></div>
            <div><span>Activities</span><strong>{completedCount}/4</strong></div>
            <div><span>XP earned</span><strong>{xpPoints.toLocaleString()}</strong></div>
            <div><span>Learning gems</span><strong>{learningGems}</strong></div>
          </div>
          <Link href="/student/courses" className="summary-button">Open Full Progress</Link>
        </article>
      </section>

      <div className="dashboard-navigation">
        <BottomNavigationContainer onPrevious={goToPrevLesson} onNext={goToNextLesson} />
      </div>
    </div>
  );
}
