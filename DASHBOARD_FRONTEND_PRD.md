# 📊 Sunqu Dashboard Frontend - Product Requirements Document (PRD)

## 🎯 Executive Summary

The Sunqu Dashboard is a real-time analytics interface designed for educational administrators, psychologists, and counselors to monitor the emotional wellbeing of secondary school students in Peru. The dashboard provides actionable insights from AI-powered conversations, helping identify trends, risk patterns, and intervention opportunities.

---

## 📋 Product Overview

### Vision Statement

Create an intuitive, responsive dashboard that transforms raw emotional data from student conversations into meaningful insights that drive proactive mental health support in schools.

### Success Metrics

- **Adoption Rate**: 90% of qualified personnel actively use the dashboard weekly
- **Response Time**: Average intervention response time reduced by 50%
- **Data Accuracy**: 95% accuracy in problem identification and trending
- **User Satisfaction**: 4.5+ rating from education professionals

---

## 👥 Target Users

### Primary Users

1. **School Psychologists** - Monitor student emotional trends, identify at-risk students
2. **Educational Coordinators** - Understand school-wide emotional health patterns
3. **Counselors** - Track intervention effectiveness and student progress

### Secondary Users

1. **School Directors** - Review overall institutional emotional wellbeing metrics
2. **Ministry of Education Officials** - Analyze regional emotional health trends

---

## 🎨 User Interface Requirements

### Dashboard Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ 🏠 Sunqu Dashboard                         🔔 👤 Settings   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📊 OVERVIEW CARDS (Row 1)                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ Estudiantes │ │ Estudiantes │ │ Satisfacción│ │ Satisfac│ │
│ │ Activos     │ │ con         │ │ Chatbot     │ │ Escuela │ │
│ │    XXX      │ │ Problemas   │ │    X.X/5    │ │  X.X/5  │ │
│ │             │ │    XX%      │ │             │ │         │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
│                                                             │
│ 📈 ANALYTICS SECTION (Row 2)                               │
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Principales         │ │ Principales Emociones           │ │
│ │ Problemas           │ │                                 │ │
│ │ 📊 Bar Chart        │ │ 📊 Donut Chart                  │ │
│ │                     │ │                                 │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
│                                                             │
│ 🎓 INSIGHTS SECTION (Row 3)                                │
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Aprendizajes        │ │ Recomendaciones Personalizadas  │ │
│ │ Reportados          │ │                                 │ │
│ │ 📊 Horizontal Bars  │ │ 💡 Cards with Actions           │ │
│ │                     │ │                                 │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Technical Specifications

### Frontend Technology Stack

- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS for rapid UI development using Shadcn UI components
- **Charts**: Chart.js for data visualization
- **State Management**: React Query + Zustand
- **HTTP Client**: Fetch API with interceptors for error handling
- **Date Handling**: Day.js for time zone management
- **Icons**: Heroicons or Lucide React

### API Integration

- **Base URL**: `/api/dashboard/analytics`
- **Error Handling**: Toast notifications for user feedback
- **Loading States**: Skeleton loaders for better UX
- **Data Refresh**: Auto-refresh every 5 minutes + manual refresh button

---

## 📊 Data Visualization Requirements

### Overview Cards

```typescript
interface OverviewCard {
  title: string;
  value: number | string;
  subtitle?: string;
  trendValue?: number;
}
```

---

## 🔄 User Interactions & Functionality

### Core Features

#### 1. Real-time Data Display

- **Auto-refresh**: Every 5 minutes
- **Manual refresh**: Button in top-right corner
- **Last updated**: Timestamp display
- **Loading states**: Skeleton components during fetch

#### 3. Export Functionality

- **PDF Export**: Generate report with current dashboard state
- **CSV Export**: Raw data download for further analysis
- **Share Report**: Generate shareable link with current view

## 🔗 API Contract

### Dashboard Analytics Endpoint

```typescript
GET / api / dashboard / analytics;

Response: {
  success: boolean;
  data: {
    summary: {
      active_students: number;
      students_with_problems_percentage: number;
      chatbot_satisfaction: number;
      school_satisfaction: number;
    }
    main_problems: Array<{
      name: string;
      percentage: number;
    }>;
    main_emotions: Array<{
      name: string;
      percentage: number;
    }>;
    reported_learnings: Array<{
      name: string;
      percentage: number;
    }>;
    recommendations: Array<{
      id: number;
      title: string;
      description: string;
      color: string;
    }>;
  }
}
```
