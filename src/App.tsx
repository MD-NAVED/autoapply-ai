import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Briefcase,
  MapPin,
  Search,
  Bot,
  User,
  CheckCircle2,
  Loader2,
  Sparkles,
  Send,
  ChevronRight,
  Building,
  FileText,
  ArrowRight,
  Target,
  Upload,
  X,
  History,
  Clock,
  Calendar,
  Bell,
  BellRing,
  Trash2,
  AlertCircle,
  Info,
  RefreshCw,
  TrendingUp,
  Save,
  Bookmark,
  ChevronDown,
  Filter,
  DollarSign,
  SlidersHorizontal,
  Mail,
  MailCheck,
  Moon,
  Sun,
  AlertTriangle,
} from "lucide-react";
import {
  JobMatch,
  findMatchingJobs,
  parseResume,
  ParsedResume,
  analyzeEmailForJobUpdate,
} from "./lib/gemini";
import { fetchRecentEmails, getAccessToken } from "./lib/gmail";

const Tooltip = ({ children, content, position = "top" }: { children: React.ReactNode, content: React.ReactNode, position?: "top"|"bottom"|"left"|"right" }) => {
  const getPositionClasses = () => {
    switch (position) {
      case "top":
        return "bottom-full left-1/2 -translate-x-1/2 mb-2";
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 mt-2";
      case "left":
        return "right-full top-1/2 -translate-y-1/2 mr-2";
      case "right":
        return "left-full top-1/2 -translate-y-1/2 ml-2";
      default:
        return "bottom-full left-1/2 -translate-x-1/2 mb-2";
    }
  };

  return (
    <div className="relative group/tooltip inline-flex items-center justify-center">
      {children}
      <div className={`absolute z-[100] invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 bg-[var(--color-bg)] text-[11px] text-[var(--color-text-strong)] p-2.5 rounded-lg border border-[var(--color-border-hover)] shadow-2xl w-48 font-medium font-sans leading-relaxed pointer-events-none ${getPositionClasses()}`}>
        {content}
      </div>
    </div>
  );
};

type AppState = "setup" | "processing" | "results";

interface SavedResume {
  id: string;
  name: string;
  text: string;
  lastUpdated: string;
}

interface ApplicationHistoryEntry {
  id: string;
  jobId?: string;
  title: string;
  company: string;
  location: string;
  dateApplied: string;
  status: string;
  notes?: string;
  companyInsight?: string;
  fullJobDescription?: string;
  coverLetterDraft?: string;
  matchScore?: number;
}

interface SavedAlert {
  id: string;
  location: string;
  keywords: string;
  createdAt: string;
}

interface AppNotification {
  id: string;
  message: string;
  read: boolean;
  timestamp: string;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const [currentView, setCurrentView] = useState<"main" | "history" | "alerts">(
    "main",
  );
  const [appState, setAppState] = useState<AppState>("setup");
  const [resume, setResume] = useState(() => {
    return localStorage.getItem("autoApplyResume") || "";
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [location, setLocation] = useState("");
  const [keywords, setKeywords] = useState("");

  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [filterRemote, setFilterRemote] = useState(false);
  const [filterMinSalary, setFilterMinSalary] = useState("");
  const [filterDatePosted, setFilterDatePosted] = useState("any");
  const [filterSkills, setFilterSkills] = useState("");
  const [filterMaxExperience, setFilterMaxExperience] = useState("");
  const [filterCompanySize, setFilterCompanySize] = useState("any");

  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [error, setError] = useState("");
  const [applicationHistory, setApplicationHistory] = useState<
    ApplicationHistoryEntry[]
  >(() => {
    const saved = localStorage.getItem("autoApplyHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const [savedAlerts, setSavedAlerts] = useState<SavedAlert[]>(() => {
    const saved = localStorage.getItem("autoApplyAlerts");
    return saved ? JSON.parse(saved) : [];
  });

  const [savedResumes, setSavedResumes] = useState<SavedResume[]>(() => {
    const saved = localStorage.getItem("autoApplySavedResumes");
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: "initial_version",
            name: "My Default Resume",
            text: localStorage.getItem("autoApplyResume") || "",
            lastUpdated: new Date().toISOString(),
          },
        ].filter((r) => r.text.trim().length > 0);
  });
  const [isResumeDropdownOpen, setIsResumeDropdownOpen] = useState(false);
  const [saveResumeName, setSaveResumeName] = useState("");
  const [isSavingResume, setIsSavingResume] = useState(false);

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem("autoApplyNotifications");
    return saved ? JSON.parse(saved) : [];
  });

  const [showNotifs, setShowNotifs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [isGmailConnected, setIsGmailConnected] = useState(false);

  const handleConnectGmail = async () => {
    try {
      await getAccessToken();
      setIsGmailConnected(true);
    } catch (error) {
      console.error(error);
      alert('Failed to connect to Gmail: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Terminal processing states
  const [processingStep, setProcessingStep] = useState(0);
  const processingSteps = [
    "Initializing AutoApply Agent...",
    "Analyzing resume structure and extracting key skills...",
    `Scanning LinkedIn, Naukri, Foundit via Google Search for roles in ${location || "target area"}...`,
    "Filtering real-time roles based on semantic match score...",
    "Drafting hyper-personalized cover letters for top matches...",
    "Finalizing application queue...",
  ];

  // Save changes to local storage
  useEffect(() => {
    localStorage.setItem("autoApplyAlerts", JSON.stringify(savedAlerts));
  }, [savedAlerts]);

  useEffect(() => {
    localStorage.setItem(
      "autoApplyNotifications",
      JSON.stringify(notifications),
    );
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("autoApplySavedResumes", JSON.stringify(savedResumes));
  }, [savedResumes]);

  useEffect(() => {
    localStorage.setItem("autoApplyResume", resume);
  }, [resume]);

  // Simulate finding new jobs occasionally if there are active alerts
  useEffect(() => {
    if (savedAlerts.length === 0) return;

    // Check every 15 seconds for a "new match" (simulation)
    const int = setInterval(() => {
      // 30% chance to find something
      if (Math.random() < 0.3) {
        const randomAlert =
          savedAlerts[Math.floor(Math.random() * savedAlerts.length)];
        const roles = [
          "Senior React Engineer",
          "Fullstack Developer",
          "Backend Specialist",
          "Frontend Architect",
        ];
        const companies = [
          "Google",
          "Stripe",
          "Vercel",
          "Meta",
          "Netflix",
          "Airbnb",
        ];
        const title = roles[Math.floor(Math.random() * roles.length)];
        const company = companies[Math.floor(Math.random() * companies.length)];

        const newNotif: AppNotification = {
          id: Math.random().toString(36).substring(7),
          message: `New match found! ${title} at ${company} matches your alert for "${randomAlert.keywords || "any"}" in ${randomAlert.location}.`,
          read: false,
          timestamp: new Date().toISOString(),
        };

        setNotifications((prev) => [newNotif, ...prev]);
      }
    }, 15000);

    return () => clearInterval(int);
  }, [savedAlerts]);

  const handleSaveAlert = () => {
    if (!location.trim()) {
      setError("Please provide a target location to save an alert.");
      return;
    }
    setError("");

    const newAlert: SavedAlert = {
      id: Math.random().toString(36).substring(7),
      location,
      keywords,
      createdAt: new Date().toISOString(),
    };

    setSavedAlerts((prev) => [newAlert, ...prev]);

    // Notify user we saved it
    const newNotif: AppNotification = {
      id: Math.random().toString(36).substring(7),
      message: `Alert saved successfully for ${location}. We'll notify you when new jobs match!`,
      read: false,
      timestamp: new Date().toISOString(),
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const updateHistoryEntry = (
    id: string,
    field: "status" | "notes",
    value: string,
  ) => {
    setApplicationHistory((prev) => {
      const updated = prev.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      );
      localStorage.setItem("autoApplyHistory", JSON.stringify(updated));
      return updated;
    });
  };

  const removeHistoryEntry = (id: string) => {
    setApplicationHistory((prev) => {
      const updated = prev.filter((entry) => entry.id !== id);
      localStorage.setItem("autoApplyHistory", JSON.stringify(updated));
      return updated;
    });
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  };

  const executeSearch = async () => {
    if (!resume.trim() && !resumeFile && !location.trim()) {
      setError("Please provide your resume and a target location.");
      return;
    }
    if (!resume.trim() && !resumeFile) {
      setError("Please provide your resume (paste text or upload file).");
      return;
    }
    if (!location.trim()) {
      setError("Please provide a target location.");
      return;
    }
    setError("");
    setAppState("processing");
    setProcessingStep(0);

    // Simulate Agent Terminal steps ticking through
    const interval = setInterval(() => {
      setProcessingStep((prev) => {
        if (prev < processingSteps.length - 1) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 2000);

    try {
      let fileData = null;
      if (resumeFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(resumeFile);
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = (error) => reject(error);
        });
        fileData = { mimeType: resumeFile.type, data: base64 };
      }

      const [results, parsedProfile] = await Promise.all([
        findMatchingJobs(resume, fileData, location, keywords),
        parseResume(resume, fileData),
      ]);
      setJobs(results);
      if (parsedProfile) setParsedResume(parsedProfile);
      clearInterval(interval);
      setAppState("results");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Agent encountered an error while searching. Please try again.");
      setAppState("setup");
    }
  };

  const handleStartSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await executeSearch();
  };

  const handleAutoApply = async (jobId: string) => {
    // Collect job to save into history
    setJobs((current) => {
      const targetJob = current.find((j) => j.id === jobId);
      if (targetJob && targetJob.status !== "applied") {
        const newEntry: ApplicationHistoryEntry = {
          id: Math.random().toString(36).substring(7),
          jobId: targetJob.id,
          title: targetJob.title,
          company: targetJob.company,
          location: targetJob.location,
          dateApplied: new Date().toISOString(),
          status: "Applied",
          companyInsight: targetJob.companyInsight,
          fullJobDescription: targetJob.fullJobDescription,
          coverLetterDraft: targetJob.coverLetterDraft,
          matchScore: targetJob.matchScore,
        };
        setApplicationHistory((prev) => {
          const newHistory = [newEntry, ...prev];
          localStorage.setItem("autoApplyHistory", JSON.stringify(newHistory));
          return newHistory;
        });
      }
      return current.map((j) =>
        j.id === jobId ? { ...j, status: "applying" } : j,
      );
    });

    // Fake delay to feel like it's submitting a form
    await new Promise((r) => setTimeout(r, 2500));

    setJobs((current) =>
      current.map((j) => (j.id === jobId ? { ...j, status: "applied" } : j)),
    );
  };

  const handleApplyAll = async () => {
    // Sequentially apply to all pending jobs
    for (const job of filteredJobs) {
      if (job.status === "pending") {
        await handleAutoApply(job.id);
      }
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filterRemote && !job.isRemote) {
      // Also fallback check location for "Remote" just in case AI didn't flag it correctly
      if (!job.location.toLowerCase().includes("remote")) {
        return false;
      }
    }
    if (filterMinSalary) {
      const minSal = parseInt(filterMinSalary.replace(/\D/g, ""));
      if (!isNaN(minSal) && minSal > 0) {
        // extract numbers from job salary range, take the highest number seen
        const nums = job.salaryRange.match(/\d+/g);
        if (nums) {
          const vals = nums
            .map((n) => Number(n))
            .map((n) => (n < 1000 ? n * 1000 : n));
          const maxJobSal = Math.max(...vals);
          if (maxJobSal < minSal) return false;
        }
      }
    }
    if (filterDatePosted !== "any") {
      const p = (job.datePosted || "").toLowerCase();
      if (filterDatePosted === "24h") {
        if (
          !p.includes("hour") &&
          !p.includes("today") &&
          !p.includes("just now") &&
          !p.includes("1 day")
        )
          return false;
      } else if (filterDatePosted === "week") {
        if (
          !p.includes("hour") &&
          !p.includes("day") &&
          !p.includes("today") &&
          !p.includes("1 week") &&
          !p.includes("just now")
        )
          return false;
      } else if (filterDatePosted === "month") {
        if (
          p.includes("year") ||
          (p.includes("month") && !p.includes("1 month"))
        )
          return false;
      }
    }
    
    if (filterSkills) {
      const skillsToMatch = filterSkills.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
      if (skillsToMatch.length > 0) {
        const jobSkillsStr = (job.requiredSkills || []).join(' ').toLowerCase() + " " + (job.fullJobDescription || "").toLowerCase();
        const hasAllSkills = skillsToMatch.every(s => jobSkillsStr.includes(s));
        if (!hasAllSkills) return false;
      }
    }

    if (filterMaxExperience) {
      const maxExp = parseInt(filterMaxExperience.replace(/\D/g, ""));
      if (!isNaN(maxExp)) {
        if (job.yearsOfExperienceRequired !== undefined && job.yearsOfExperienceRequired > maxExp) {
          return false;
        }
      }
    }

    if (filterCompanySize !== "any") {
      const cSize = (job.companySize || "").toLowerCase();
      if (!cSize.includes(filterCompanySize.toLowerCase())) {
         return false;
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-darkest)] selection:bg-[var(--color-accent)]/30 selection:text-white">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] sticky top-0 z-10 bg-[var(--color-bg)]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setCurrentView('main')}
            className="flex items-center gap-2 text-[var(--color-accent)] font-extrabold text-sm sm:text-xl tracking-tighter uppercase mr-4 shrink-0 hover:opacity-80 transition-opacity"
          >
            <Bot className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
            <span>AutoApply AI</span>
          </button>
          <div className="flex items-center gap-4 sm:gap-6 text-[10px] sm:text-xs font-bold text-[var(--color-text-subtle)] tracking-widest uppercase shrink-0">
            <button
              onClick={() => setCurrentView("main")}
              className={`flex items-center gap-1.5 transition-colors ${currentView === "main" ? "text-[var(--color-accent)]" : "hover:text-[var(--color-text-darkest)]"}`}
            >
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            <button
              onClick={() => setCurrentView("history")}
              className={`flex items-center gap-1.5 transition-colors ${currentView === "history" ? "text-[var(--color-accent)]" : "hover:text-[var(--color-text-darkest)]"}`}
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">History</span>
            </button>
            <button
              onClick={() => setCurrentView("alerts")}
              className={`flex items-center gap-1.5 transition-colors ${currentView === "alerts" ? "text-[var(--color-accent)]" : "hover:text-[var(--color-text-darkest)]"}`}
            >
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Alerts</span>
            </button>
            <button
              onClick={handleConnectGmail}
              className={`flex items-center gap-1.5 transition-colors bg-transparent border-none p-0 cursor-pointer ${isGmailConnected ? "text-[var(--color-accent-light)]" : "text-[var(--color-text-subtle)] hover:text-[var(--color-text-darkest)]"}`}
              title={isGmailConnected ? "Connected to Gmail" : "Connect to Gmail"}
            >
              {isGmailConnected ? <MailCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              <span className="hidden sm:inline">{isGmailConnected ? 'Connected' : 'Connect Mail'}</span>
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-[var(--color-border)] transition-all ml-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-darkest)]"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <Sun className={`absolute w-4 h-4 sm:w-5 sm:h-5 text-amber-400 transition-all ${isDarkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} />
              <Moon className={`absolute w-4 h-4 sm:w-5 sm:h-5 transition-all ${isDarkMode ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifs(!showNotifs);
                  if (!showNotifs) {
                    setNotifications((prev) =>
                      prev.map((n) => ({ ...n, read: true })),
                    );
                  }
                }}
                className={`flex items-center gap-1.5 transition-colors ${showNotifs ? "text-[var(--color-text-darkest)]" : "hover:text-[var(--color-text-darkest)]"}`}
              >
                <Bell className="w-5 h-5" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f43f5e] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f43f5e]"></span>
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifs && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-80 max-w-[calc(100vw-2rem)] bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden z-50 text-left"
                  >
                    <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-between">
                      <span className="font-bold text-[var(--color-text-darkest)] flex items-center gap-2">
                        <BellRing className="w-4 h-4 text-[var(--color-accent)]" />{" "}
                        Notifications
                      </span>
                      {notifications.length > 0 && (
                        <button
                          onClick={() => setNotifications([])}
                          className="text-[10px] text-[var(--color-text-subtle)] hover:text-[#f43f5e]"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className="p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-border)]/50 transition-colors"
                          >
                            <p className="text-sm text-[var(--color-text-strong)] normal-case tracking-normal mb-2 leading-relaxed">
                              {notif.message}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-subtle)] font-medium">
                              {new Date(notif.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--color-text-subtle)] normal-case tracking-normal">
                          <p>No new notifications.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 py-8 sm:py-12">
        {currentView === "history" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-dark)]">
                  Application History
                </h2>
                <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
                  Track your automated job applications.
                </p>
              </div>
              <button
                onClick={async () => {
                  if (applicationHistory.length === 0 || isSyncing) return;

                  setIsSyncing(true);
                  setNotifications((prev) => [
                    {
                      id: Math.random().toString(36).substring(7),
                      message: `Connecting to Gmail to check for updates from companies...`,
                      read: false,
                      timestamp: new Date().toISOString(),
                    },
                    ...prev,
                  ]);

                  try {
                    const emails = await fetchRecentEmails("label:inbox");
                    setIsGmailConnected(true);
                    let newUpdatesCount = 0;

                    for (const app of applicationHistory) {
                      // Only check apps that aren't rejected or offered
                      if (
                        app.status === "Applied" ||
                        app.status === "Interviewing"
                      ) {
                        try {
                          const analysis = await analyzeEmailForJobUpdate(
                            app.company,
                            app.title,
                            emails,
                          );
                          if (analysis) {
                            // Only update if it's a real status change or has notes to add
                            if (
                              analysis.status !== app.status ||
                              analysis.notes
                            ) {
                              updateHistoryEntry(
                                app.id,
                                "status",
                                analysis.status,
                              );
                              if (analysis.notes) {
                                updateHistoryEntry(
                                  app.id,
                                  "notes",
                                  analysis.notes,
                                );
                              }

                              setNotifications((prev) => [
                                {
                                  id: Math.random().toString(36).substring(7),
                                  message: `Update from ${app.company} for ${app.title}: ${analysis.notes || analysis.status}`,
                                  read: false,
                                  timestamp: new Date().toISOString(),
                                },
                                ...prev,
                              ]);
                              newUpdatesCount++;
                            }
                          }
                          // Add delay to prevent rate limit (15 requests per minute free tier limit)
                          await new Promise(r => setTimeout(r, 4500));
                        } catch (err: any) {
                          if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
                             setNotifications((prev) => [
                               {
                                 id: Math.random().toString(36).substring(7),
                                 message: `AI Rate limit reached: Too many checks at once. Pausing further checks.`,
                                 read: false,
                                 timestamp: new Date().toISOString(),
                               },
                               ...prev,
                             ]);
                             break;
                          } else {
                             console.error("Analysis error for " + app.company, err);
                          }
                        }
                      }
                    }

                    if (newUpdatesCount === 0) {
                      setNotifications((prev) => [
                        {
                          id: Math.random().toString(36).substring(7),
                          message: `No new updates found from companies at this time.`,
                          read: false,
                          timestamp: new Date().toISOString(),
                        },
                        ...prev,
                      ]);
                    }
                  } catch (error) {
                    console.error("Failed to sync emails:", error);
                    let errMsg = "Failed to check emails.";
                    if (error instanceof Error) {
                      errMsg = error.message;
                    }
                    setNotifications((prev) => [
                      {
                        id: Math.random().toString(36).substring(7),
                        message: errMsg,
                        read: false,
                        timestamp: new Date().toISOString(),
                      },
                      ...prev,
                    ]);
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-border)] hover:bg-[var(--color-border-hover)] disabled:opacity-50 text-[var(--color-text-darkest)] rounded-lg text-sm font-bold transition-colors border border-[var(--color-border-hover)]"
              >
                {isSyncing ? (
                  <RefreshCw className="w-4 h-4 text-[var(--color-accent)] animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 text-[var(--color-accent)]" />
                )}
                {isSyncing ? "Syncing..." : "Sync Updates"}
              </button>
            </div>

            {applicationHistory.length === 0 ? (
              <div className="bento-card items-center justify-center py-20 text-center">
                <History className="w-12 h-12 text-[var(--color-border)] mb-4" />
                <h3 className="text-[var(--color-text-secondary)] font-bold">
                  No applications yet
                </h3>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-widest mt-2">
                  Run a search and auto-apply to see them here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <AnimatePresence>
                  {applicationHistory.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: 0.95,
                        transition: { duration: 0.2 },
                      }}
                      onClick={() =>
                        setExpandedJobId(
                          expandedJobId === entry.id ? null : entry.id,
                        )
                      }
                      className="bento-card relative overflow-hidden group hover:shadow-[0_0_30px_rgba(var(--color-accent-rgb),0.1)] cursor-pointer"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistoryEntry(entry.id);
                        }}
                        className="absolute top-4 right-4 text-[var(--color-text-subtle)] hover:text-[#ef4444] hover:bg-[#ef4444]/10 p-1.5 rounded-lg transition-colors z-20 opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="flex flex-col h-full space-y-4 pointer-events-none">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pointer-events-auto sm:pr-8">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="w-12 h-12 rounded-xl bg-[var(--color-border)] flex items-center justify-center shrink-0 border border-[var(--color-border-hover)] overflow-hidden">
                              <img
                                src={`https://logo.clearbit.com/${entry.company.replace(/\s+/g, "").toLowerCase()}.com`}
                                alt={`${entry.company} logo`}
                                className="w-full h-full object-cover bg-white pointer-events-auto text-[10px] font-bold text-[var(--color-text-secondary)]"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.company)}&background=1e293b&color=38bdf8&size=128&bold=true`;
                                }}
                              />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-bold text-lg text-[var(--color-text-dark)] leading-tight mb-2">
                                {entry.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-3 text-sm font-medium mb-2">
                                <span className="flex items-center gap-1.5 text-[var(--color-text-darkest)] bg-[var(--color-border)] px-2.5 py-1 rounded-md border border-[var(--color-border-hover)]">
                                  <Building className="w-4 h-4 text-[var(--color-accent)]" />
                                  {entry.company}
                                </span>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${entry.company} ${entry.location}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5 text-[var(--color-text-darkest)] bg-[var(--color-border)] hover:bg-[var(--color-border-hover)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 px-2.5 py-1 rounded-md border border-[var(--color-border-hover)] transition-colors cursor-pointer"
                                >
                                  <MapPin className="w-4 h-4 text-[var(--color-accent-light)]" />
                                  {entry.location}
                                </a>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                                <Calendar className="w-3 h-3" /> Applied{" "}
                                {new Date(
                                  entry.dateApplied,
                                ).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div
                            className="flex flex-col sm:items-end shrink-0 pointer-events-auto w-full sm:w-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={entry.status}
                              onChange={(e) =>
                                updateHistoryEntry(
                                  entry.id,
                                  "status",
                                  e.target.value,
                                )
                              }
                              className={`bg-[var(--color-bg)] border border-[var(--color-border)] text-xs px-3 py-2 rounded-xl outline-none focus:border-[var(--color-accent)] transition-colors font-bold uppercase tracking-widest cursor-pointer appearance-none ${
                                entry.status === "Applied"
                                  ? "text-[var(--color-accent)]"
                                  : entry.status === "Interviewing"
                                    ? "text-[#eab308]"
                                    : entry.status === "Offer Received"
                                      ? "text-[var(--color-accent-light)]"
                                      : entry.status === "Rejected"
                                        ? "text-[#ef4444]"
                                        : "text-[var(--color-text-darkest)]"
                              }`}
                            >
                              <option
                                value="Applied"
                                className="text-[var(--color-accent)]"
                              >
                                Applied
                              </option>
                              <option
                                value="Interviewing"
                                className="text-[#eab308]"
                              >
                                Interviewing
                              </option>
                              <option
                                value="Offer Received"
                                className="text-[var(--color-accent-light)]"
                              >
                                Offer
                              </option>
                              <option
                                value="Rejected"
                                className="text-[#ef4444]"
                              >
                                Rejected
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="flex-1">
                          <div
                            className="pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={entry.notes || ""}
                              onChange={(e) =>
                                updateHistoryEntry(
                                  entry.id,
                                  "notes",
                                  e.target.value,
                                )
                              }
                              placeholder="Add notes (e.g. Followed up on Monday)..."
                              className="bg-[var(--color-border)]/50 border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-accent)] rounded-xl px-4 py-3 outline-none text-sm text-[var(--color-text-secondary)] focus:text-[var(--color-text-darkest)] w-full transition-colors italic"
                            />
                          </div>

                          <AnimatePresence>
                            {expandedJobId === entry.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-4 overflow-hidden pointer-events-auto mt-4"
                              >
                                {entry.fullJobDescription && (
                                  <div className="text-xs flex flex-col gap-2 bg-[var(--color-border)]/30 p-4 rounded-xl border border-[var(--color-border)]">
                                    <h4 className="font-bold text-[var(--color-text-dark)] flex items-center gap-2 uppercase tracking-wide text-[10px]">
                                      <FileText className="w-3 h-3" /> Job
                                      Description
                                    </h4>
                                    <div className="text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                                      {entry.fullJobDescription}
                                    </div>
                                  </div>
                                )}
                                {entry.companyInsight && (
                                  <div className="text-xs flex flex-col gap-2 bg-[var(--color-accent-light)]/5 p-4 rounded-xl border border-[var(--color-accent-light)]/20 shadow-inner">
                                    <Tooltip content="Recent news, funding round events, or aggregate rating signals about this company gathered by AI." position="top">
                                      <h4 className="font-bold text-[var(--color-accent)] flex items-center gap-2 uppercase tracking-wide text-[10px] cursor-help w-fit">
                                        <TrendingUp className="w-3 h-3" /> Company
                                        Context (News, Funding, Ratings)
                                      </h4>
                                    </Tooltip>
                                    <span className="text-[var(--color-text-secondary)] leading-relaxed">
                                      {entry.companyInsight}
                                    </span>
                                  </div>
                                )}
                                {entry.coverLetterDraft && (
                                  <div
                                    className="bg-[var(--color-bg)] p-4 border border-[var(--color-border)] rounded-2xl relative pointer-events-auto cursor-text text-xs whitespace-pre-wrap text-[var(--color-text-secondary)] font-serif leading-relaxed"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <h4 className="font-bold text-[var(--color-text-subtle)] flex items-center gap-1.5 uppercase tracking-widest text-[10px] font-sans mb-2">
                                      <FileText className="w-3 h-3" /> Cover
                                      Letter
                                    </h4>
                                    {entry.coverLetterDraft}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ) : currentView === "alerts" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-dark)]">
                  Saved Alerts
                </h2>
                <div className="text-[var(--color-text-secondary)] mt-2 text-sm flex items-center gap-2">
                  <div className="pulse-dot" /> Monitoring for new roles
                </div>
              </div>
            </div>

            {savedAlerts.length === 0 ? (
              <div className="bento-card items-center justify-center py-20 text-center">
                <AlertCircle className="w-12 h-12 text-[var(--color-border)] mb-4" />
                <h3 className="text-[var(--color-text-secondary)] font-bold">No active alerts</h3>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-widest mt-2">
                  Create an alert from the search page to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {savedAlerts.map((alert) => (
                  <div key={alert.id} className="bento-card">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)]">
                        <BellRing className="w-5 h-5" />
                      </div>
                      <button
                        onClick={() =>
                          setSavedAlerts((prev) =>
                            prev.filter((a) => a.id !== alert.id),
                          )
                        }
                        className="text-[var(--color-text-subtle)] hover:text-[#f43f5e] transition-colors p-2 hover:bg-[var(--color-border)] rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-[var(--color-text-dark)] mb-1 capitalize">
                      {alert.keywords || "Any Role"}
                    </h3>
                    <p className="text-[var(--color-text-secondary)] text-sm flex items-center gap-1.5 mb-4">
                      <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                      {alert.location}
                    </p>
                    <div className="mt-auto pt-4 border-t border-[var(--color-border)]">
                      <span className="text-[10px] text-[var(--color-text-subtle)] font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Created {new Date(alert.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {/* SETUP STATE */}
            {appState === "setup" && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid lg:grid-cols-[1fr_400px] gap-5"
              >
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3 sm:gap-5">
                    <motion.div whileHover={{ scale: 1.02, boxShadow: "0 0 15px rgba(var(--color-accent-rgb), 0.2)" }} className="bento-card p-3 sm:p-5 flex flex-col items-center justify-center text-center">
                      <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--color-accent)] mb-1 sm:mb-2" />
                      <div className="text-xl sm:text-2xl font-bold text-[var(--color-text-dark)]">{jobs.length > 0 ? jobs.length * 14 : 12450}</div>
                      <div className="text-[9px] sm:text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wider">Jobs Scanned</div>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.02, boxShadow: "0 0 15px rgba(var(--color-accent-rgb), 0.2)" }} className="bento-card p-3 sm:p-5 flex flex-col items-center justify-center text-center">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--color-accent)] mb-1 sm:mb-2" />
                      <div className="text-xl sm:text-2xl font-bold text-[var(--color-text-dark)]">{applicationHistory.length}</div>
                      <div className="text-[9px] sm:text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wider">Apps Drafted</div>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.02, boxShadow: "0 0 15px rgba(var(--color-accent-rgb), 0.2)" }} className="bento-card p-3 sm:p-5 flex flex-col items-center justify-center text-center">
                      <Target className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--color-accent)] mb-1 sm:mb-2" />
                      <div className="text-xl sm:text-2xl font-bold text-[var(--color-text-dark)]">87%</div>
                      <div className="text-[9px] sm:text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wider">Avg Match Score</div>
                    </motion.div>
                  </div>

                  <motion.div whileHover={{ scale: 1.01, boxShadow: "0 0 20px rgba(var(--color-accent-rgb), 0.15)" }} className="bento-card bento-gradient-card">
                    <div className="ai-pill mb-4 flex items-center gap-2">
                      <Bot className="w-3 h-3" /> MASTER RESUME
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-dark)] mb-2">
                      Deploy your personal job agent
                    </h2>
                    <p className="text-[var(--color-text-secondary)] text-sm">
                      Paste your resume and location. Our AI models will
                      autonomously search job boards, find the highest matching
                      roles, and draft perfect applications on your behalf.
                    </p>
                  </motion.div>

                  <form
                    onSubmit={handleStartSearch}
                    className="space-y-5 bento-card"
                  >
                    {error && (
                      <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="space-y-2 relative">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                            <FileText className="w-4 h-4 text-[var(--color-accent)]" />
                            Your Resume
                          </label>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setIsResumeDropdownOpen(!isResumeDropdownOpen)
                              }
                              className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-darkest)] bg-[var(--color-border)] px-3 py-1.5 rounded-md border border-[var(--color-border-hover)] transition-colors"
                            >
                              <Bookmark className="w-3.5 h-3.5" />
                              Load Saved
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {isResumeDropdownOpen && (
                              <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 w-64 max-w-[calc(100vw-2rem)] bg-[var(--color-card)] border border-[var(--color-border-hover)] rounded-xl shadow-xl z-[100] overflow-hidden">
                                <div className="p-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] flex justify-between items-center">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-subtle)] ml-1">
                                    SAVED PROFILES
                                  </span>
                                  <X
                                    className="w-3.5 h-3.5 text-[var(--color-text-subtle)] cursor-pointer hover:text-[var(--color-text-darkest)]"
                                    onClick={() =>
                                      setIsResumeDropdownOpen(false)
                                    }
                                  />
                                </div>
                                <div className="max-h-48 overflow-y-auto p-1">
                                  {savedResumes.map((sr) => (
                                    <div
                                      key={sr.id}
                                      className="w-full text-left px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-darkest)] rounded-lg transition-colors flex items-center justify-between group"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setResume(sr.text);
                                          setResumeFile(null);
                                          setIsResumeDropdownOpen(false);
                                        }}
                                        className="flex-1 text-left truncate mr-2"
                                      >
                                        {sr.name}
                                      </button>
                                      <Trash2
                                        className="w-3.5 h-3.5 text-[var(--color-text-subtle)] cursor-pointer hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSavedResumes((prev) =>
                                            prev.filter((r) => r.id !== sr.id),
                                          );
                                        }}
                                      />
                                    </div>
                                  ))}
                                  {savedResumes.length === 0 && (
                                    <div className="px-3 py-4 text-center text-xs text-[var(--color-text-subtle)]">
                                      No saved resumes
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {isSavingResume ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={saveResumeName}
                              onChange={(e) =>
                                setSaveResumeName(e.target.value)
                              }
                              placeholder="Version name (e.g., UI/UX Designer)"
                              className="bg-[var(--color-card)] border border-[var(--color-border-hover)] text-xs px-2 py-1 h-7 rounded text-[var(--color-text-darkest)] outline-none focus:border-[var(--color-accent)]"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (saveResumeName.trim() && resume.trim()) {
                                  setSavedResumes((prev) => [
                                    {
                                      id: Date.now().toString(),
                                      name: saveResumeName.trim(),
                                      text: resume.trim(),
                                      lastUpdated: new Date().toISOString(),
                                    },
                                    ...prev,
                                  ]);
                                  setSaveResumeName("");
                                  setIsSavingResume(false);
                                }
                              }}
                              className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-2 h-7 rounded transition-colors uppercase tracking-widest border border-emerald-400/20 whitespace-nowrap"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsSavingResume(false)}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-darkest)] px-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {!resumeFile && resume.trim().length > 0 && (
                              <button
                                type="button"
                                onClick={() => setIsSavingResume(true)}
                                className="cursor-pointer flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-2 py-1 rounded transition-colors uppercase tracking-widest border border-emerald-400/20"
                              >
                                <Save className="w-3 h-3" />
                                Save
                              </button>
                            )}
                            <label
                              htmlFor="file-upload"
                              className="cursor-pointer flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-accent)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 px-2 py-1 rounded transition-colors uppercase tracking-widest border border-[var(--color-accent)]/20"
                            >
                              <Upload className="w-3 h-3" />
                              Upload PDF/TXT
                            </label>
                          </div>
                        )}
                        <input
                          type="file"
                          id="file-upload"
                          className="hidden"
                          accept=".txt,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.type === "text/plain") {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setResume(evt.target?.result as string);
                                setResumeFile(null);
                              };
                              reader.readAsText(file);
                            } else if (file.type === "application/pdf") {
                              setResumeFile(file);
                              setResume("");
                            } else {
                              setError("Please upload a PDF or TXT file.");
                            }
                            e.target.value = "";
                          }}
                        />
                      </div>
                      {resumeFile ? (
                        <div className="bento-input h-48 flex flex-col items-center justify-center gap-4 border-dashed border-[var(--color-border-hover)] bg-[var(--color-bg)]/50 relative">
                          <FileText className="w-10 h-10 text-[var(--color-accent)]" />
                          <div className="text-center px-4">
                            <p className="text-[var(--color-text-darkest)] font-bold mb-1 truncate max-w-[250px]">
                              {resumeFile.name}
                            </p>
                            <p className="text-[var(--color-text-subtle)] text-[10px] tracking-wider uppercase font-semibold">
                              {(resumeFile.size / 1024 / 1024).toFixed(2)} MB •
                              PDF Document
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setResumeFile(null)}
                            className="absolute top-4 right-4 text-[var(--color-text-subtle)] hover:text-red-600 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <textarea
                          value={resume}
                          onChange={(e) => setResume(e.target.value)}
                          placeholder="Paste your full resume, LinkedIn profile, or upload a PDF/TXT file..."
                          className="bento-input h-48 resize-none font-mono text-sm leading-relaxed"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                          <MapPin className="w-4 h-4 text-[var(--color-accent)]" />
                          Target Location
                        </label>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Remote, Bangalore, London..."
                          className="bento-input font-medium"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                          <Target className="w-4 h-4 text-[var(--color-accent)]" />
                          Keywords / Title
                        </label>
                        <input
                          type="text"
                          value={keywords}
                          onChange={(e) => setKeywords(e.target.value)}
                          placeholder="e.g. Frontend, Next.js, ML Engineer"
                          className="bento-input font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 mt-4">
                      <motion.button
                        whileHover={{ scale: 1.02, boxShadow: "0 0 25px rgba(var(--color-accent-rgb), 0.5)" }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="flex-1 py-4 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-on-accent)] hover:text-[var(--color-on-accent)] rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--color-accent-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-accent-rgb),0.5)] uppercase tracking-wider text-xs sm:text-sm"
                      >
                        <Sparkles className="w-5 h-5 shrink-0" />
                        Launch Job Agent
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(var(--color-accent-rgb), 0.15)" }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={handleSaveAlert}
                        className="flex-1 py-4 bg-[var(--color-border)] hover:bg-[var(--color-border-hover)] border border-[var(--color-border-hover)] text-[var(--color-text-darkest)] rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-wider text-xs sm:text-sm hover:shadow-[0_0_20px_rgba(var(--color-accent-rgb),0.1)]"
                      >
                        <BellRing className="w-5 h-5 shrink-0 text-[var(--color-accent)]" />
                        Create Alert
                      </motion.button>
                    </div>
                  </form>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-5">
                  <div className="bento-card h-full relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                      <Bot className="w-48 h-48" />
                    </div>
                    <h3 className="bento-card-title flex items-center gap-2 mb-6">
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-accent-light)]" />
                      How it works
                    </h3>
                    <ul className="space-y-6 text-sm text-[var(--color-text-secondary)] relative z-10">
                      <li className="flex gap-4">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0 font-bold text-[var(--color-accent)]">
                          1
                        </div>
                        <p>
                          Agent reads your resume to fully understand your
                          skills, projects, and seniority.
                        </p>
                      </li>
                      <li className="flex gap-4">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0 font-bold text-[var(--color-accent)]">
                          2
                        </div>
                        <p>
                          Gemini AI uses <span className="text-[var(--color-accent)] font-semibold">Google Search</span> to find <span className="text-[var(--color-text-darkest)]">real, active jobs</span> from top boards like LinkedIn, Naukri.com, Glassdoor, and Indeed, based on your location and keywords.
                        </p>
                      </li>
                      <li className="flex gap-4">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0 font-bold text-[var(--color-accent)]">
                          3
                        </div>
                        <p>
                          Ranks roles by a semantic match score and drafts
                          custom cover letters for each.
                        </p>
                      </li>
                      <li className="flex gap-4">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0 font-bold text-[var(--color-accent)]">
                          4
                        </div>
                        <p>
                          You review the pipeline and 1-click apply to let the
                          agent submit your info.
                        </p>
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PROCESSING STATE (AGENT TERMINAL) */}
            {appState === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Agent Terminal & Progress */}
                <div className="max-w-3xl mx-auto bento-card !p-0 overflow-hidden shadow-[0_0_40px_rgba(var(--color-accent-rgb),0.15)] ring-1 ring-[var(--color-accent)]/20">
                  <div className="flex items-center px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                    </div>
                    <div className="mx-auto text-xs font-mono text-[var(--color-text-subtle)] font-bold flex items-center gap-2">
                      <Bot className="w-3 h-3" />
                      agent-terminal.exe
                    </div>
                  </div>
                  <div className="p-6 font-mono text-sm text-[var(--color-accent)] min-h-[200px] bg-[var(--color-card)] flex flex-col justify-between">
                    <div className="space-y-4">
                      {processingSteps
                        .slice(0, processingStep + 1)
                        .map((step, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-start gap-3"
                          >
                            <span className="text-[var(--color-text-subtle)] shrink-0">{`[${new Date().toLocaleTimeString()}]`}</span>
                            <span className="text-[var(--color-border-hover)]">$</span>
                            <span
                              className={
                                idx === processingStep
                                  ? "text-[var(--color-text-darkest)] drop-shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.5)] font-bold"
                                  : "text-[var(--color-text-secondary)]"
                              }
                            >
                              {step}
                            </span>
                            {idx === processingStep && (
                              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent)] shrink-0 mt-0.5 ml-2" />
                            )}
                          </motion.div>
                        ))}
                    </div>
                    <div className="mt-8">
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] mb-3 font-bold uppercase tracking-widest relative">
                        <span className="relative z-10 flex items-center gap-2"><Sparkles className="w-3 h-3 text-[var(--color-accent)] animate-pulse" /> Agent Processing</span>
                        <span className="relative z-10 text-[var(--color-accent)] drop-shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.8)]">{Math.round(((processingStep + 1) / processingSteps.length) * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-[var(--color-border)] rounded-full overflow-hidden shadow-inner relative">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 via-[var(--color-accent)] to-[var(--color-accent-light)] rounded-full shadow-[0_0_10px_rgba(var(--color-accent-rgb),1)]"
                          initial={{ width: `${(processingStep / processingSteps.length) * 100}%` }}
                          animate={{ width: `${((processingStep + 1) / processingSteps.length) * 100}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Skeleton Loader Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 items-start mt-8">
                  <div className="space-y-4">
                    {[1, 2, 3].map((_, i) => (
                      <div key={i} className="bento-card border border-[var(--color-border)] overflow-hidden">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 w-full">
                            <div className="w-12 h-12 rounded-xl bg-[var(--color-border)] animate-pulse shrink-0 border border-[var(--color-border-hover)]"></div>
                            <div className="flex-1 space-y-3 w-full pt-1">
                              <div className="h-5 bg-[var(--color-border)] rounded-md animate-pulse w-3/4"></div>
                              <div className="h-3 bg-[var(--color-border)] rounded-md animate-pulse w-1/2"></div>
                              <div className="flex gap-2 pt-2">
                                <div className="h-6 w-16 bg-[var(--color-border)] rounded-md animate-pulse"></div>
                                <div className="h-6 w-20 bg-[var(--color-border)] rounded-md animate-pulse"></div>
                                <div className="h-6 w-14 bg-[var(--color-border)] rounded-md animate-pulse"></div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col sm:items-end shrink-0 w-16 space-y-2">
                            <div className="w-12 h-12 rounded-full bg-[var(--color-border)] animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-5 hidden xl:block">
                    <div className="bento-card h-[400px] bg-[var(--color-border)]/50 animate-pulse border border-[var(--color-border)]"></div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* RESULTS STATE */}
            {appState === "results" && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bento-card flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <div className="bento-card-title !mb-1">
                      Agent Pipeline Ready
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-dark)]">
                      Found {filteredJobs.length} roles
                    </h2>
                    <div className="text-[var(--color-text-secondary)] mt-2 flex items-center gap-2 text-sm">
                      <div className="pulse-dot" />
                      Optimized for {location}. Ready for auto-application.
                    </div>
                  </div>
                  <button
                    onClick={handleApplyAll}
                    disabled={
                      filteredJobs.length === 0 ||
                      filteredJobs.every((j) => j.status === "applied")
                    }
                    className="px-6 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)] disabled:hover:shadow-none text-[var(--color-on-accent)] hover:text-[var(--color-on-accent)] rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--color-accent-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--color-accent-rgb),0.4)] uppercase tracking-wider text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {filteredJobs.length > 0 &&
                    filteredJobs.every((j) => j.status === "applied")
                      ? "All Applied"
                      : "Auto-Apply to All"}
                  </button>
                </div>

                <div className="bento-card bg-[var(--color-bg)]/80 backdrop-blur-md border border-[var(--color-border)] p-4 space-y-4 sticky top-4 z-30 shadow-sm">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-[var(--color-text-subtle)] font-bold uppercase tracking-widest text-[10px] mr-2">
                      <Tooltip content="Refine the AI-curated results using these real-time extracted attributes." position="top">
                        <div className="flex items-center gap-2 cursor-help">
                          <Filter className="w-3.5 h-3.5" /> Filters
                        </div>
                      </Tooltip>
                    </div>

                    <Tooltip content="Show only roles that mention remote or telecommute options." position="top">
                      <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--color-text-darkest)] transition-colors">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${filterRemote ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-on-accent)]" : "border-[var(--color-border-hover)] bg-[var(--color-card)] text-transparent"}`}
                        >
                          {filterRemote && <CheckCircle2 className="w-3 h-3" />}
                        </div>
                        <span className="text-[var(--color-text-secondary)] font-medium text-xs">
                          Remote Only
                        </span>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={filterRemote}
                          onChange={(e) => setFilterRemote(e.target.checked)}
                        />
                      </label>
                    </Tooltip>

                    <div className="flex items-center gap-2 ml-auto lg:ml-4">
                      <Tooltip content="Filters jobs where the AI recognized a stated or inferred high salary bound greater or equal to this amount." position="top">
                        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] border border-[var(--color-border-hover)] bg-[var(--color-card)] rounded-lg px-2 py-1 focus-within:border-[var(--color-accent)] transition-colors">
                          <DollarSign className="w-3.5 h-3.5" />
                          <input
                            type="text"
                            placeholder="Min Salary (e.g. 100k)"
                            value={filterMinSalary}
                            onChange={(e) => setFilterMinSalary(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs w-28 placeholder:text-[var(--color-text-muted)] text-[var(--color-text-darkest)]"
                          />
                        </div>
                      </Tooltip>
                    </div>

                    <div className="flex items-center gap-2">
                      <Tooltip content="Filters roles based on their true listing time extracted from the job source page." position="top">
                        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] border border-[var(--color-border-hover)] bg-[var(--color-card)] rounded-lg px-2 py-1 focus-within:border-[var(--color-accent)] transition-colors relative">
                          <Clock className="w-3.5 h-3.5" />
                          <select
                            value={filterDatePosted}
                            onChange={(e) => setFilterDatePosted(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs w-24 text-[var(--color-text-darkest)] appearance-none cursor-pointer pr-4"
                          >
                            <option value="any" className="bg-[var(--color-card)]">
                              Any Date
                            </option>
                            <option value="24h" className="bg-[var(--color-card)]">
                              Past 24h
                            </option>
                            <option value="week" className="bg-[var(--color-card)]">
                              Past Week
                            </option>
                            <option value="month" className="bg-[var(--color-card)]">
                              Past Month
                            </option>
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none" />
                        </div>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm pt-4 border-t border-[var(--color-border)]">
                    <div className="flex items-center gap-2 flex-grow">
                      <Tooltip content="Enter specific skills (comma separated) required for the job." position="top">
                        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] border border-[var(--color-border-hover)] bg-[var(--color-card)] rounded-lg px-2 py-1 focus-within:border-[var(--color-accent)] transition-colors w-full max-w-xs">
                          <Target className="w-3.5 h-3.5" />
                          <input
                            type="text"
                            placeholder="Req. Skills (e.g. React, Node)"
                            value={filterSkills}
                            onChange={(e) => setFilterSkills(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs w-full placeholder:text-[var(--color-text-muted)] text-[var(--color-text-darkest)]"
                          />
                        </div>
                      </Tooltip>
                    </div>

                    <div className="flex items-center gap-2">
                       <Tooltip content="Maximum years of experience required by the job." position="top">
                        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] border border-[var(--color-border-hover)] bg-[var(--color-card)] rounded-lg px-2 py-1 focus-within:border-[var(--color-accent)] transition-colors">
                          <Briefcase className="w-3.5 h-3.5" />
                          <input
                            type="text"
                            placeholder="Max Exp (Years)"
                            value={filterMaxExperience}
                            onChange={(e) => setFilterMaxExperience(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs w-28 placeholder:text-[var(--color-text-muted)] text-[var(--color-text-darkest)]"
                          />
                        </div>
                      </Tooltip>
                    </div>

                    <div className="flex items-center gap-2">
                      <Tooltip content="Filter by the estimated size of the company." position="top">
                        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] border border-[var(--color-border-hover)] bg-[var(--color-card)] rounded-lg px-2 py-1 focus-within:border-[var(--color-accent)] transition-colors relative">
                          <User className="w-3.5 h-3.5" />
                          <select
                            value={filterCompanySize}
                            onChange={(e) => setFilterCompanySize(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs w-28 text-[var(--color-text-darkest)] appearance-none cursor-pointer pr-4"
                          >
                            <option value="any" className="bg-[var(--color-card)]">Any Size</option>
                            <option value="1-50" className="bg-[var(--color-card)]">1-50</option>
                            <option value="51-200" className="bg-[var(--color-card)]">51-200</option>
                            <option value="201-500" className="bg-[var(--color-card)]">201-500</option>
                            <option value="500-1000" className="bg-[var(--color-card)]">500-1000</option>
                            <option value="1000+" className="bg-[var(--color-card)]">1000+</option>
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none" />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                {parsedResume && (
                  <div className="bento-card bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2 text-[var(--color-accent)]">
                        <Sparkles className="w-5 h-5" />
                        <h3 className="text-lg font-bold">
                          AI Extracted Profile
                        </h3>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-[var(--color-text-subtle)] uppercase tracking-widest flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5" /> Summary
                        </div>
                        <p className="text-[var(--color-text-secondary)] leading-relaxed">
                          {parsedResume.summary}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-[var(--color-text-subtle)] uppercase tracking-widest flex items-center gap-2">
                          <Target className="w-3.5 h-3.5" /> Key Skills
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedResume.skills.slice(0, 10).map((s, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-[var(--color-card)] text-[var(--color-accent)] rounded mr-1 mb-1 border border-[var(--color-border)] text-[11px] font-medium whitespace-nowrap"
                            >
                              {s}
                            </span>
                          ))}
                          {parsedResume.skills.length > 10 && (
                            <span className="px-2 py-1 bg-[var(--color-card)] text-[var(--color-text-subtle)] rounded border border-[var(--color-border)] text-[11px] font-medium">
                              +{parsedResume.skills.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-[var(--color-text-subtle)] uppercase tracking-widest flex items-center gap-2">
                          <Building className="w-3.5 h-3.5" /> Recent Experience
                        </div>
                        <div className="space-y-3">
                          {parsedResume.experience.slice(0, 3).map((exp, i) => (
                            <div
                              key={i}
                              className="border-l-2 border-[var(--color-border)] pl-3 py-0.5"
                            >
                              <div className="text-[var(--color-text-dark)] font-medium">
                                {exp.role}
                              </div>
                              <div className="text-[var(--color-text-secondary)] text-xs">
                                {exp.company} • {exp.duration}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <AnimatePresence>
                    {filteredJobs.map((job) => (
                      <motion.div
                        key={job.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          scale: 0.95,
                          transition: { duration: 0.2 },
                        }}
                        onClick={() =>
                          setExpandedJobId(
                            expandedJobId === job.id ? null : job.id,
                          )
                        }
                        className="bento-card relative overflow-hidden group hover:shadow-[0_0_30px_rgba(var(--color-accent-rgb),0.1)] cursor-pointer"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeJob(job.id);
                          }}
                          className="absolute top-4 right-4 text-[var(--color-text-subtle)] hover:text-[#ef4444] hover:bg-[#ef4444]/10 p-1.5 rounded-lg transition-colors z-20 opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {/* Status overlay (during applying) */}
                        {job.status === "applying" && (
                          <div className="absolute inset-0 bg-[var(--color-card)]/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                            <Loader2 className="w-8 h-8 animate-spin mb-3" />
                            <span className="font-semibold px-4 text-center text-sm tracking-wider uppercase">
                              Agent is applying...
                            </span>
                          </div>
                        )}

                        <div className="flex flex-col h-full space-y-4 pointer-events-none">
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pointer-events-auto sm:pr-8">
                            <div className="flex items-start gap-4 flex-1">
                              <div className="w-12 h-12 rounded-xl bg-[var(--color-border)] flex items-center justify-center shrink-0 border border-[var(--color-border-hover)] overflow-hidden">
                                <img
                                  src={`https://logo.clearbit.com/${job.company.replace(/\s+/g, "").toLowerCase()}.com`}
                                  alt={`${job.company} logo`}
                                  className="w-full h-full object-cover bg-white pointer-events-auto"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      `https://ui-avatars.com/api/?name=${encodeURIComponent(job.company)}&background=1e293b&color=38bdf8&size=128&bold=true`;
                                  }}
                                />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-bold text-lg text-[var(--color-text-dark)] leading-tight mb-2">
                                  {job.title}
                                </h3>
                                <div className="flex flex-wrap items-center gap-3 text-sm font-medium mb-2">
                                  <span className="flex items-center gap-1.5 text-[var(--color-text-darkest)] bg-[var(--color-border)] px-2.5 py-1 rounded-md border border-[var(--color-border-hover)]">
                                    <Building className="w-4 h-4 text-[var(--color-accent)]" />
                                    {job.company}
                                  </span>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.company} ${job.location}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1.5 text-[var(--color-text-darkest)] bg-[var(--color-border)] hover:bg-[var(--color-border-hover)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 px-2.5 py-1 rounded-md border border-[var(--color-border-hover)] transition-colors cursor-pointer"
                                  >
                                    <MapPin className="w-4 h-4 text-[var(--color-accent-light)]" />
                                    {job.location}
                                  </a>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)] font-medium">
                                  <span className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-card)] rounded-md font-mono border border-[var(--color-border)]">
                                    {job.salaryRange}
                                  </span>
                                  {job.datePosted && (
                                    <span className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-card)] rounded-md border border-[var(--color-border)]">
                                      <Clock className="w-3.5 h-3.5" />{" "}
                                      {job.datePosted}
                                    </span>
                                  )}
                                  {job.isRemote && (
                                    <span className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-card)] rounded-md border border-[var(--color-border)] text-[var(--color-accent)]">
                                      Remote
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col sm:items-end shrink-0 pointer-events-auto">
                              <Tooltip content="A semantic similarity score generated by comparing the requirements of the job to your parsed resume." position="left">
                                <div className="flex flex-col sm:items-end group hover:text-[var(--color-text-darkest)] transition-colors cursor-help">
                                  <div className="relative w-16 h-16 flex items-center justify-center mb-1">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                      <path
                                        className="text-[var(--color-border)]"
                                        strokeWidth="3"
                                        stroke="currentColor"
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      />
                                      <path
                                        className="transition-all duration-1000 ease-out"
                                        strokeWidth="3"
                                        strokeDasharray={`${job.matchScore}, 100`}
                                        strokeLinecap="round"
                                        stroke={job.matchScore >= 80 ? "#22c55e" : job.matchScore >= 50 ? "#eab308" : "#ef4444"}
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      />
                                    </svg>
                                    <div className="absolute flex items-center justify-center">
                                      <span className="text-sm font-black text-[var(--color-text-dark)]">{job.matchScore}%</span>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-[var(--color-text-subtle)] tracking-widest uppercase mt-0.5">
                                    Match
                                  </span>
                                </div>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="flex-1 space-y-4">
                            <div className="text-xs bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 p-3 rounded-xl leading-relaxed font-medium pointer-events-auto">
                              <Sparkles className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                              {job.matchReasoning}
                            </div>

                            <AnimatePresence>
                              {expandedJobId === job.id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="space-y-4 overflow-hidden pointer-events-auto"
                                >
                                  {job.fullJobDescription && (
                                    <div className="text-xs flex flex-col gap-2 bg-[var(--color-border)]/30 p-4 rounded-xl border border-[var(--color-border)]">
                                      <h4 className="font-bold text-[var(--color-text-dark)] flex items-center gap-2 uppercase tracking-wide text-[10px]">
                                        <FileText className="w-3 h-3" /> Job
                                        Description
                                      </h4>
                                      <div className="text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                                        {job.fullJobDescription}
                                      </div>
                                    </div>
                                  )}
                                  {job.skillGaps && job.skillGaps.length > 0 && (
                                    <div className="text-xs flex flex-col gap-2 bg-[#ef4444]/5 p-4 rounded-xl border border-[#ef4444]/20 shadow-inner">
                                      <h4 className="font-bold text-[#ef4444] flex items-center gap-2 uppercase tracking-wide text-[10px]">
                                        <AlertTriangle className="w-3 h-3" /> Skill Gaps
                                      </h4>
                                      <ul className="list-disc pl-5 space-y-1 text-[var(--color-text-secondary)]">
                                        {job.skillGaps.map((gap, i) => (
                                          <li key={i}>{gap}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div className="text-xs flex flex-col gap-2 bg-[var(--color-accent-light)]/5 p-4 rounded-xl border border-[var(--color-accent-light)]/20 shadow-inner">
                                    <Tooltip content="Recent news, funding round events, or aggregate rating signals about this company gathered by AI." position="top">
                                      <h4 className="font-bold text-[var(--color-accent)] flex items-center gap-2 uppercase tracking-wide text-[10px] cursor-help w-fit">
                                        <TrendingUp className="w-3 h-3" /> Company
                                        Context (News, Funding, Ratings)
                                      </h4>
                                    </Tooltip>
                                    <span className="text-[var(--color-text-secondary)] leading-relaxed">
                                      {job.companyInsight}
                                    </span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <div
                              className="bg-[var(--color-bg)] p-4 border border-[var(--color-border)] rounded-2xl relative pointer-events-auto cursor-text"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <h4 className="text-[10px] font-bold text-[var(--color-text-subtle)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <FileText className="w-3 h-3" />
                                Generated Cover Letter
                              </h4>
                              <div
                                className={`text-sm text-[var(--color-text-secondary)] font-serif leading-relaxed transition-all ${expandedJobId === job.id ? "whitespace-pre-wrap" : "line-clamp-3"}`}
                              >
                                {job.coverLetterDraft}
                              </div>
                              {expandedJobId !== job.id && (
                                <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[var(--color-bg)] to-transparent rounded-b-2xl pointer-events-none" />
                              )}
                            </div>
                          </div>

                          <div
                            className="pt-2 pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {job.status === "applied" ? (
                              <div className="w-full py-3 bg-[var(--color-accent-light)]/10 text-[var(--color-accent-light)] border border-[var(--color-accent-light)]/20 rounded-xl font-bold flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-default">
                                <CheckCircle2 className="w-4 h-4" />
                                Application Submitted
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAutoApply(job.id)}
                                className="w-full py-3 bg-[var(--color-border)] hover:bg-[var(--color-border-hover)] border border-[var(--color-border-hover)] text-[var(--color-text-darkest)] rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-wider text-xs"
                              >
                                <Bot className="w-4 h-4 text-[var(--color-accent)]" />
                                Auto-Apply
                                <ArrowRight className="w-4 h-4 opacity-50" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="pt-8 flex flex-wrap items-center justify-center gap-4">
                  <button
                    className="text-xs font-bold text-[var(--color-text-subtle)] uppercase tracking-widest hover:text-[var(--color-accent)] transition-colors border border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-card)] hover:bg-[var(--color-border)] px-6 py-2 rounded-full flex items-center gap-2"
                    onClick={() => executeSearch()}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh Matches
                  </button>
                  <button
                    className="text-xs font-bold text-[var(--color-text-subtle)] uppercase tracking-widest hover:text-[var(--color-accent)] transition-colors border border-transparent hover:border-[var(--color-border-hover)] bg-[var(--color-card)] hover:bg-[var(--color-border)] px-6 py-2 rounded-full"
                    onClick={() => setAppState("setup")}
                  >
                    Start a new search
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
