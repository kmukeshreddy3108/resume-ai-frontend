/**
 * Application Core Logic
 * Handles Routing, State Management, and View Rendering
 */
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://resume-ai-backend-fgy7.onrender.com";

const App = {
    state: {
        user: null,
        currentView: 'landing',
        data: {
            resumes: [],
            jobs: [],
            myJobs: [],
            selectedJobId: "",
            jobResults: null,
            isLoading: false,
            candidateSort: "high_to_low",
            candidateMinScore: 0,
            candidateSearch: ""
        }
    },

    studentChartInstance: null,
    recruiterChartInstance: null,

    init() {
        console.log('AI Resume Analyser Initialized');

        const savedUser = localStorage.getItem("resumeai_user");
        const savedToken = localStorage.getItem("resumeai_token");

        if (savedUser && savedToken) {
            this.state.user = JSON.parse(savedUser);
        }

        const hash = window.location.hash.slice(1);
        if (hash) {
            this.handleRoute(hash);
        } else {
            this.navigate('landing');
        }

        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.slice(1);
            if (newHash) {
                this.handleRoute(newHash);
            }
        });
    },

    getToken() {
        return localStorage.getItem("resumeai_token");
    },

    setLoading(value) {
        this.state.data.isLoading = value;
    },

    getLoadingText(defaultText, loadingText = "Loading...") {
        return this.state.data.isLoading ? loadingText : defaultText;
    },

    getErrorMessage(error, fallback = "Something went wrong") {
        console.error("DEBUG: Detailed Error Object:", error);
        if (!error) return fallback;
        
        let msg = typeof error === "string" ? error : (error.message || fallback);
        
        if (error.response && error.response.data) {
            msg = error.response.data.detail || msg;
        }

        if (typeof msg === "string" && (msg.startsWith("{") || msg.startsWith("["))) {
            try {
                const parsed = JSON.parse(msg);
                msg = parsed.detail || parsed.message || parsed.error?.message || msg;
            } catch (e) {}
        }
        
        return typeof msg === "string" ? msg : JSON.stringify(msg);
    },

    async parseResponse(response, fallbackMessage = "Request failed") {
        let data = null;

        try {
            data = await response.json();
        } catch {
            throw new Error(fallbackMessage);
        }

        if (!response.ok) {
            const errorInfo = data?.detail || data?.error || data?.message || fallbackMessage;
            throw new Error(typeof errorInfo === 'string' ? errorInfo : JSON.stringify(errorInfo));
        }

        return data;
    },

    navigate(path) {
        window.location.hash = path;
    },

    async fetchResumes() {
        const token = this.getToken();
        if (!token) return [];

        try {
            const response = await fetch(`${API_BASE}/resumes`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const data = await this.parseResponse(response, "Could not load resume history");
            const resumes = data.data?.resumes || [];
            this.state.data.resumes = resumes;
            return resumes;
        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Could not load resume history"), "error");
            return [];
        }
    },

    async fetchJobs() {
        const token = this.getToken();
        if (!token) return [];

        try {
            const response = await fetch(`${API_BASE}/jobs`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const data = await this.parseResponse(response, "Could not load jobs");
            const jobs = data.data || [];
            this.state.data.jobs = jobs;
            return jobs;
        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Could not load jobs"), "error");
            return [];
        }
    },

    async fetchMyJobs() {
        const token = this.getToken();
        if (!token) return [];

        try {
            const response = await fetch(`${API_BASE}/my-jobs`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const data = await this.parseResponse(response, "Could not load your jobs");
            const jobs = data.data || [];
            this.state.data.myJobs = jobs;
            return jobs;
        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Could not load your jobs"), "error");
            return [];
        }
    },

    async fetchJobResults(jobId) {
        const token = this.getToken();
        if (!token || !jobId) return null;

        try {
            const response = await fetch(`${API_BASE}/job-results/${jobId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const data = await this.parseResponse(response, "Could not load job results");
            this.state.data.selectedJobId = jobId;
            this.state.data.jobResults = data.data;
            return data.data;
        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Could not load job results"), "error");
            return null;
        }
    },

    async handleSelectRecruiterJob(jobId) {
        if (!jobId) {
            this.state.data.selectedJobId = "";
            this.state.data.jobResults = null;
            this.render("dashboard-recruiter", { subView: "candidates" });
            return;
        }

        await this.fetchJobResults(jobId);
        this.render("dashboard-recruiter", { subView: "candidates" });
    },

    handleCandidateSortChange(value) {
        this.state.data.candidateSort = value;
        this.render("dashboard-recruiter", { subView: "candidates" });
    },

    handleCandidateMinScoreChange(value) {
        const parsed = Number(value);
        this.state.data.candidateMinScore = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
        this.render("dashboard-recruiter", { subView: "candidates" });
    },

    handleCandidateSearchChange(value) {
        this.state.data.candidateSearch = value || "";
        this.render("dashboard-recruiter", { subView: "candidates" });
    },

    getFilteredCandidates() {
        const results = this.state.data.jobResults;
        if (!results?.candidates) return [];

        const candidateSort = this.state.data.candidateSort;
        const candidateMinScore = this.state.data.candidateMinScore;
        const candidateSearch = (this.state.data.candidateSearch || "").trim().toLowerCase();

        let filteredCandidates = [...results.candidates];

        filteredCandidates = filteredCandidates.filter(candidate => {
            const email = (candidate.email || "").toLowerCase();
            const emailMatch = !candidateSearch || email.includes(candidateSearch);
            const scoreMatch = (candidate.match_score || 0) >= candidateMinScore;
            return emailMatch && scoreMatch;
        });

        filteredCandidates.sort((a, b) => {
            if (candidateSort === "low_to_high") {
                return (a.match_score || 0) - (b.match_score || 0);
            }
            return (b.match_score || 0) - (a.match_score || 0);
        });

        // Apply Target Hires (Limit)
        const targetHiresInput = document.getElementById("filter-target-hires");
        const targetHires = targetHiresInput ? parseInt(targetHiresInput.value) : NaN;
        
        if (!isNaN(targetHires) && targetHires > 0) {
            filteredCandidates = filteredCandidates.slice(0, targetHires);
        }

        return filteredCandidates;
    },

    async handleRoute(routeStr) {
        const parts = routeStr.split('/');
        const view = parts[0];
        const subView = parts[1] || 'overview';

        this.state.currentView = view;

        if (this.state.user && view === 'dashboard-student') {
            await this.fetchResumes();
            await this.fetchJobs();
        }

        if (this.state.user && view === 'dashboard-recruiter') {
            await this.fetchJobs();
            const myJobs = await this.fetchMyJobs();

            if (subView === "candidates" && myJobs.length) {
                const currentSelected = this.state.data.selectedJobId;
                const jobIdToLoad = currentSelected || myJobs[0].id;
                await this.fetchJobResults(jobIdToLoad);
            }
        }

        this.render(view, { subView });
        this.updateNav();
    },

    updateNav() {
        const navMenu = document.getElementById('nav-menu');
        if (!this.state.user) {
            navMenu.innerHTML = `
                <button class="btn btn-ghost" onclick="App.navigate('auth/recruiter')">For Recruiters</button>
                <button class="btn btn-primary" onclick="App.navigate('auth/student')">
                    <span>Student Portal</span>
                    <i class="ri-arrow-right-line"></i>
                </button>
            `;
        } else {
            const role = this.state.user.role;
            const dashRoute = role === 'recruiter' ? 'dashboard-recruiter' : 'dashboard-student';
            navMenu.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <button class="btn btn-ghost" onclick="App.navigate('${dashRoute}')">Dashboard</button>
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; font-weight: bold; cursor: pointer;">
                        ${this.state.user.name.charAt(0)}
                    </div>
<button class="btn btn-primary" onclick="App.logout()">
    <i class="ri-logout-box-r-line"></i> Logout
</button>                </div>
            `;
        }
    },

    logout() {
        this.state.user = null;
        this.state.data.resumes = [];
        this.state.data.jobs = [];
        this.state.data.myJobs = [];
        this.state.data.selectedJobId = "";
        this.state.data.jobResults = null;
        this.state.data.isLoading = false;
        this.state.data.candidateSort = "high_to_low";
        this.state.data.candidateMinScore = 0;
        this.state.data.candidateSearch = "";

        if (this.studentChartInstance) {
            this.studentChartInstance.destroy();
            this.studentChartInstance = null;
        }

        if (this.recruiterChartInstance) {
            this.recruiterChartInstance.destroy();
            this.recruiterChartInstance = null;
        }

        localStorage.removeItem("resumeai_user");
        localStorage.removeItem("resumeai_token");
        this.navigate('landing');
        this.showToast('Logged out successfully', 'success');
    },

    async handleLogin(event, role) {
        event.preventDefault();

        const email = document.getElementById("login-email")?.value.trim();
        const password = document.getElementById("login-password")?.value.trim();

        if (!email || !password) {
            this.showToast("Email and password are required", "warning");
            return;
        }

        try {
            this.setLoading(true);
            this.render("auth", { subView: role });
            // Removed Authenticating toast for cleaner UI

            const response = await fetch(`${API_BASE}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await this.parseResponse(response, "Login failed");
            const payload = data.data || data;
            if (payload.role !== role) {
                this.showToast(
                    `This account is registered as ${payload.role}. Please login from the correct portal.`,
                    "error"
                );
                return;
            }

            const user = {
                email: payload.email,
                role: payload.role || role,
                name: payload.email ? payload.email.split("@")[0] : role,
                id: payload.email || role
            };

            localStorage.setItem("resumeai_token", payload.access_token);
            localStorage.setItem("resumeai_user", JSON.stringify(user));

            this.state.user = user;

            this.showToast("Login successful!", "success");

            const dashRoute = user.role === "recruiter"
                ? "dashboard-recruiter"
                : "dashboard-student";

            this.navigate(dashRoute);

        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Login failed"), "error");
        } finally {
            this.setLoading(false);
            this.render("auth", { subView: role });
        }
    },

    async handleSignup(event, role) {
        event.preventDefault();

        const email = document.getElementById("signup-email")?.value.trim();
        const password = document.getElementById("signup-password")?.value.trim();
        const confirmPassword = document.getElementById("signup-confirm-password")?.value.trim();
        const otp = document.getElementById("signup-otp")?.value.trim();

        if (!email || !password || !confirmPassword || !otp) {
            this.showToast("All fields including OTP are required", "warning");
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{6,72}$/;

        if (!passwordRegex.test(password)) {
            this.showToast(
                "Password must be 6-72 chars, include uppercase, lowercase, number & special character",
                "error"
            );
            return;
        }

        try {
            this.setLoading(true);
            this.render("auth", { subView: role });
            // Removed Creating account toast for cleaner UI

            console.log(`Sending signup request to: ${API_BASE}/signup`);
            const response = await fetch(`${API_BASE}/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password,
                    role,
                    otp
                })
            });

            await this.parseResponse(response, "Signup failed");
            console.log("DEBUG: Signup successful, showing toast...");
            this.showToast("Account is created", "success");
            this.navigate(`auth/${role}`);

        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Signup failed"), "error");
        } finally {
            this.setLoading(false);
            this.render("auth", { subView: role });
        }
    },

    async sendOtp() {
        const email = document.getElementById("signup-email")?.value.trim();

        if (!email) {
            this.showToast("Enter email first", "warning");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/send-otp`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.detail || "OTP failed");

            this.showToast("OTP sent to your email!", "success");

        } catch (err) {
            this.showToast(this.getErrorMessage(err, "OTP failed"), "error");
        }
    },

    async handleDeleteResume(jobId) {
        if (!confirm("Are you sure you want to delete this application?")) return;
        
        try {
            const token = this.getToken();
            const response = await fetch(`${API_BASE}/resumes/${jobId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            await this.parseResponse(response, "Delete failed");
            this.showToast("Application deleted", "success");
            await this.fetchResumes();
            this.render("dashboard-student", { subView: "applications" });
        } catch (error) {
            this.showToast(this.getErrorMessage(error), "error");
        }
    },

    async handleDeleteJob(jobId) {
        if (!confirm("Are you sure you want to delete this job and all its applications?")) return;
        
        try {
            const token = this.getToken();
            const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            await this.parseResponse(response, "Delete failed");
            this.showToast("Job deleted", "success");
            await this.fetchMyJobs();
            await this.fetchJobs();
            this.render("dashboard-recruiter", { subView: "jobs" });
        } catch (error) {
            this.showToast(this.getErrorMessage(error), "error");
        }
    },

    async handleSendBulkEmail() {
        const filtered = this.getFilteredCandidates();
        if (!filtered.length) return;
        
        const message = prompt("Enter the message to send to all selected candidates:", "We reviewed your resume for the position and would like to proceed with an interview. Please let us know your availability.");
        if (!message) return;
        
        try {
            this.setLoading(true);
            const token = this.getToken();
            const emails = filtered.map(c => c.email);
            
            const response = await fetch(`${API_BASE}/notify-candidates`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    job_id: this.state.data.selectedJobId,
                    message: message,
                    candidate_emails: emails
                })
            });
            
            const data = await this.parseResponse(response, "Failed to send notifications");
            this.showToast(data.message, "success");
        } catch (error) {
            this.showToast(this.getErrorMessage(error), "error");
        } finally {
            this.setLoading(false);
            this.render("dashboard-recruiter", { subView: "candidates" });
        }
    },

    applyRecruiterFilters() {
        const minScore = document.getElementById("filter-min-score")?.value || 0;
        const searchEmail = document.getElementById("filter-search-email")?.value || "";
        
        this.state.data.candidateMinScore = parseInt(minScore);
        this.state.data.candidateSearch = searchEmail.trim();
        
        this.render("dashboard-recruiter", { subView: "candidates" });
    },

    handlePracticeQuestion(skill, question) {
        this.startInterview(skill, question);
    },

    startInterview(skill, question) {
        this.state.interview = {
            skill: skill,
            question: question,
            answer: "",
            evaluation: null
        };
        this.render("dashboard-student", { subView: "interview" });
    },

    async handleEvaluateAnswer() {
        const session = this.state.interview || {};
        const { skill, question } = session;
        const answerInput = document.getElementById("interview-answer");
        const answer = answerInput?.value.trim();
        
        console.log("DEBUG: Evaluating answer for skill:", skill, "Question:", question);
        console.log("DEBUG: Answer content:", answer);

        if (!answer || answer.length < 5) {
            this.showToast("Please provide a more substantial answer.", "warning");
            return;
        }

        try {
            this.setLoading(true);
            this.render("dashboard-student", { subView: "interview" });

            const response = await fetch(`${API_BASE}/evaluate-interview`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({ skill, question, answer })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "AI Evaluation failed");
            }

            const evaluation = await response.json();
            console.log("DEBUG: Evaluation Result:", evaluation);
            
            this.state.interview.evaluation = evaluation;
            this.state.interview.answer = answer;
            
            this.showToast("Answer evaluated!", "success");
        } catch (error) {
            console.error("DEBUG: Evaluation Error:", error);
            this.showToast(this.getErrorMessage(error), "error");
        } finally {
            this.setLoading(false);
            this.render("dashboard-student", { subView: "interview" });
        }
    },

    async handleAnalyze(jobId) {
        const token = this.getToken();
        if (!token) {
            this.showToast("Please sign in first", "warning");
            return;
        }

        const job = this.state.data.jobs.find(j => j.id === jobId);
        if (!job) {
            this.showToast("Job not found", "error");
            return;
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.pdf';

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith(".pdf")) {
                this.showToast("Only PDF files are allowed", "warning");
                return;
            }

            try {
                this.setLoading(true);
                this.render("dashboard-student", { subView: "overview" });
                this.showToast("Analyzing resume...", "info");

                const formData = new FormData();
                formData.append("file", file);
                formData.append("job_id", job.id);
                formData.append("job_description", job.description);

                const response = await fetch(`${API_BASE}/analyze`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                const data = await this.parseResponse(response, "Resume analysis failed");

                await this.fetchResumes();
                this.showToast(`Resume analyzed! Match Score: ${data.data.match_score}%`, "success");
                this.render("dashboard-student", { subView: "applications" });

            } catch (error) {
                this.showToast(this.getErrorMessage(error, "Analyze failed"), "error");
            } finally {
                this.setLoading(false);
            }
        };

        fileInput.click();
    },

    async handleCreateJob(event) {
        event.preventDefault();

        const token = this.getToken();
        if (!token) {
            this.showToast("Please sign in first", "warning");
            return;
        }

        const title = document.getElementById("job-title")?.value.trim();
        const company = document.getElementById("job-company")?.value.trim();
        const description = document.getElementById("job-description")?.value.trim();

        if (!title || !company || !description) {
            this.showToast("All job fields are required", "warning");
            return;
        }

        if (description.length < 10) {
            this.showToast("Job description must be at least 10 characters", "warning");
            return;
        }

        try {
            this.setLoading(true);
            this.render("dashboard-recruiter", { subView: "jobs" });
            this.showToast("Creating job...", "info");

            const response = await fetch(`${API_BASE}/jobs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    company,
                    description
                })
            });

            await this.parseResponse(response, "Job creation failed");

            await this.fetchJobs();
            await this.fetchMyJobs();

            this.showToast("Job created successfully!", "success");
            this.render("dashboard-recruiter", { subView: "jobs" });

        } catch (error) {
            this.showToast(this.getErrorMessage(error, "Job creation failed"), "error");
        } finally {
            this.setLoading(false);
        }
    },
    getSkillRoadmap(skill) {
        const cleanSkill = (skill || "this skill").toLowerCase();
        
        const roadmaps = {
            "python": {
                why: "Python is the core language for AI, Backend, and Data Science. Companies like Google, Meta, and Netflix rely on it.",
                phases: [
                    { title: "Basics", steps: ["Install Python 3.12+ & VS Code", "Learn Syntax: Variables, Loops, Lists, Dicts", "Master Functions & Error Handling"] },
                    { title: "Intermediate", steps: ["OOP: Classes, Inheritance, Mixins", "Virtual Environments & Pip", "File I/O & JSON handling"] },
                    { title: "Professional", steps: ["Decorators & Generators", "Concurrency (Asyncio/Multiprocessing)", "Testing with Pytest"] }
                ],
                projects: [
                    { name: "Automation Bot", desc: "Script that cleans your desktop or parses emails." },
                    { name: "FastAPI Backend", desc: "Build a high-performance REST API with authentication." }
                ],
                questions: ["How does Python's GIL impact concurrency?", "Explain the difference between __str__ and __repr__.", "What are list comprehensions and when to avoid them?"],
                resources: ["Official Python Docs", "Real Python (blog)", "Python Crash Course (book)"]
            },
            "javascript": {
                why: "JavaScript powers the modern web. Mastering it is essential for Frontend and Full-stack roles.",
                phases: [
                    { title: "Core", steps: ["Master DOM Selection & Events", "Understand Scope & Closures", "ES6+ (Arrow functions, Destructuring)"] },
                    { title: "Advanced", steps: ["Promises, Async/Await & Fetch API", "Prototypes & Prototypal Inheritance", "Modules (ESM vs CommonJS)"] }
                ],
                projects: [
                    { name: "Kanban Board", desc: "Drag-and-drop task manager with local storage." },
                    { name: "Weather Dashboard", desc: "Real-time weather using OpenWeatherMap API." }
                ],
                questions: ["What is the Event Loop?", "Difference between '==' and '==='?", "Explain Hoisting in JavaScript."],
                resources: ["MDN Web Docs", "JavaScript.info", "You Don't Know JS (book)"]
            },
            "react": {
                why: "React is the most popular frontend library. It allows you to build highly interactive UIs efficiently.",
                phases: [
                    { title: "Fundamentals", steps: ["JSX, Props, and State", "Component Lifecycle & Hooks (useEffect)", "Conditional Rendering"] },
                    { title: "State Management", steps: ["Context API for Global State", "React Query for Server State", "Redux Toolkit (Optional)"] }
                ],
                projects: [
                    { name: "Movie Search App", desc: "Uses TMDB API with infinite scrolling." },
                    { name: "Real-time Chat", desc: "Firebase or Socket.io integration." }
                ],
                questions: ["What is reconciliation and the Virtual DOM?", "When would you use useMemo vs useCallback?", "How to optimize React performance?"],
                resources: ["React.dev", "Epic React (Kent C. Dodds)", "Scrimba React Course"]
            },
            "sql": {
                why: "Every data-driven application needs a database. SQL is the language for data retrieval.",
                phases: [
                    { title: "Queries", steps: ["SELECT, WHERE, ORDER BY", "Aggregate Functions (SUM, AVG, COUNT)", "GROUP BY & HAVING"] },
                    { title: "Modeling", steps: ["JOINS (Inner, Left, Right)", "Subqueries & Common Table Expressions (CTEs)", "Indexing & Performance Tuning"] }
                ],
                projects: [
                    { name: "Inventory System", desc: "Relational schema for a retail store." },
                    { name: "Spotify Clone Schema", desc: "Complex joins for artists, albums, and tracks." }
                ],
                questions: ["Difference between WHERE and HAVING?", "What is a Surrogate Key?", "Explain Database Normalization (1NF to 3NF)."],
                resources: ["SQLBolt", "Mode SQL Tutorial", "Database Design (Coursera)"]
            },
            "java": {
                why: "Java is the backbone of Enterprise software and Android apps. It's known for stability and scale.",
                phases: [
                    { title: "Standard", steps: ["JVM vs JRE vs JDK", "Collections Framework (List, Set, Map)", "Generics & Exception Handling"] },
                    { title: "Enterprise", steps: ["Spring Boot Fundamentals", "Hibernate/JPA for Databases", "Microservices with Spring Cloud"] }
                ],
                projects: [
                    { name: "Banking API", desc: "Secure transaction system using Spring Boot." },
                    { name: "Employee Management", desc: "Full CRUD app with thymeleaf or React." }
                ],
                questions: ["What is the difference between abstraction and encapsulation?", "How does Garbage Collection work?", "Why is Java platform independent?"],
                resources: ["Java Tutorials by Oracle", "Baeldung (Spring)", "Head First Java"]
            },
            "node.js": {
                why: "Node.js allows using JS for backend. It's fast and uses the same language as your frontend.",
                phases: [
                    { title: "Runtime", steps: ["Event Driven Architecture", "Buffer & Stream APIs", "Node Package Manager (NPM)"] },
                    { title: "Server", steps: ["Express.js Middleware", "RESTful API Best Practices", "JWT Authentication"] }
                ],
                projects: [
                    { name: "File Streaming Server", desc: "Handle large video files without crashing memory." },
                    { name: "Auth Boilerplate", desc: "Ready-to-use login/signup with MongoDB." }
                ],
                questions: ["Explain blocking vs non-blocking I/O.", "What is the purpose of module.exports?", "How to handle uncaught exceptions?"],
                resources: ["Nodejs.org Docs", "The Odin Project", "Node.js Design Patterns"]
            },
            "aws": {
                why: "Cloud computing is standard. AWS is the market leader in cloud infrastructure.",
                phases: [
                    { title: "Compute", steps: ["EC2 Instance Management", "AWS Lambda (Serverless)", "S3 Bucket Storage"] },
                    { title: "Deploy", steps: ["IAM Roles & Policies", "VPC Networking Basics", "CloudFront CDN"] }
                ],
                projects: [
                    { name: "Static Site Hosting", desc: "Host a React app on S3 with CloudFront." },
                    { name: "Image Processor", desc: "S3 trigger -> Lambda -> Thumbnail generation." }
                ],
                questions: ["What is S3 vs EBS?", "Explain AWS Lambda's cold start.", "What is a VPC?"],
                resources: ["AWS Training", "Cloud Academy", "A Cloud Guru"]
            }
        };

        const defaultRoadmap = {
            why: `${skill} is a valuable addition to your tech stack. Mastering it will provide more opportunities in your career path.`,
            phases: [
                { title: "Phase 1", steps: [`Learn core syntax of ${skill}`, `Setup development environment for ${skill}`] },
                { title: "Phase 2", steps: [`Build a small project using ${skill}`, `Learn advanced features of ${skill}`] }
            ],
            projects: [
                { name: `${skill} Utility`, desc: `A basic tool built with ${skill}.` }
            ],
            questions: [`What are the core concepts of ${skill}?`, `Common interview questions for ${skill}`],
            resources: ["Google Search", "Official Documentation", "YouTube Tutorials"]
        };

        const data = roadmaps[cleanSkill] || defaultRoadmap;

        return {
            why: data.why,
            phases: data.phases,
            projects: data.projects,
            interview: data.questions,
            resources: data.resources
        };
    },

    getBestJobMatch(resumes) {
        if (!resumes || resumes.length === 0) return null;

        const sorted = [...resumes].sort((a, b) => {
            return (b.match_score || 0) - (a.match_score || 0);
        });

        return {
            best: sorted[0],
            all: sorted
        };
    },
    getProfile() {
        const email = this.state.user?.email || "student@example.com";
        const savedProfile = localStorage.getItem(`profile_${email}`);

        if (savedProfile) {
            return JSON.parse(savedProfile);
        }

        return {
            name: this.state.user?.name || "Student",
            email: email,
            github: "",
            linkedin: "",
            education: "",
            photo: ""
        };
    },

    saveProfile(event) {
        event.preventDefault();

        const email = this.state.user?.email || "student@example.com";

        const profile = {
            name: document.getElementById("profile-name").value.trim(),
            email: email,
            github: document.getElementById("profile-github").value.trim(),
            linkedin: document.getElementById("profile-linkedin").value.trim(),
            education: document.getElementById("profile-education").value.trim(),
            photo: this.getProfile().photo
        };

        localStorage.setItem(`profile_${email}`, JSON.stringify(profile));

        this.state.user.name = profile.name || this.state.user.name;
        localStorage.setItem("resumeai_user", JSON.stringify(this.state.user));

        this.showToast("Profile updated successfully!", "success");
        setTimeout(() => {
            this.render("dashboard-student", { subView: "profile" });
        }, 100);
        this.updateNav();
    },

    handleProfilePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            this.showToast("Please upload a valid image", "warning");
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const email = this.state.user?.email || "student@example.com";
            const profile = this.getProfile();

            profile.photo = reader.result;

            localStorage.setItem(`profile_${email}`, JSON.stringify(profile));

            // 🔥 IMPORTANT FIX
            this.showToast("Photo updated!", "success");

            // Force full UI refresh
            this.state.user = { ...this.state.user };
            this.render("dashboard-student", { subView: "profile" });
        };

        reader.readAsDataURL(file);
    },

    async handleChatbotQuestion(event) {
        event.preventDefault();

        const input = document.getElementById("chatbot-input");
        const chatBox = document.getElementById("chatbot-messages");

        if (!input || !chatBox) return;

        const question = input.value.trim();

        if (!question) {
            this.showToast("Please type a question", "warning");
            return;
        }

        chatBox.innerHTML += `
        <div style="margin-bottom: 1rem; text-align: right;">
            <div style="display: inline-block; background: var(--accent-primary); padding: 0.75rem 1rem; border-radius: 12px; max-width: 80%;">
                ${question}
            </div>
        </div>

        <div id="chatbot-loading" style="margin-bottom: 1rem; text-align: left;">
            <div style="display: inline-block; background: rgba(255,255,255,0.08); padding: 0.75rem 1rem; border-radius: 12px; max-width: 80%; color: var(--text-secondary);">
                Thinking...
            </div>
        </div>
    `;

        input.value = "";
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            const latest = this.state.data.resumes?.[0];
            const isGreeting = /^(hi|hello|hey|hola|greetings|howdy|hi there|morning|evening|afternoon)(\s|[!?.])?$/i.test(question);

            const message = (latest && !isGreeting)
                ? `
[CONTEXT]
Job: ${latest.job_title || "-"}
Match Score: ${latest.match_score || 0}%
Skills: ${(latest.matched_skills || []).join(", ") || "None"}
Missing: ${(latest.missing_skills || []).join(", ") || "None"}

[USER QUESTION]
${question}
`
                : question;

            const response = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "AI response failed");
            }

            const loadingBubble = document.getElementById("chatbot-loading");
            if (loadingBubble) loadingBubble.remove();

            chatBox.innerHTML += `
            <div style="margin-bottom: 1rem; text-align: left;">
                <div style="display: inline-block; background: rgba(255,255,255,0.08); padding: 0.75rem 1rem; border-radius: 12px; max-width: 80%; color: var(--text-secondary); white-space: pre-wrap;">
                    ${data.reply}
                </div>
            </div>
        `;

        } catch (error) {
            const loadingBubble = document.getElementById("chatbot-loading");
            if (loadingBubble) loadingBubble.remove();

            chatBox.innerHTML += `
            <div style="margin-bottom: 1rem; text-align: left;">
                <div style="display: inline-block; background: rgba(239,68,68,0.12); padding: 0.75rem 1rem; border-radius: 12px; max-width: 80%; color: var(--danger);">
                    ${this.getErrorMessage(error)}
                </div>
            </div>
        `;
        }

        chatBox.scrollTop = chatBox.scrollHeight;
    },
    renderStudentChart() {
        const resumes = App.state.data.resumes || [];
        const latest = resumes.length > 0 ? resumes[0] : null;
        if (!latest) return;

        const canvas = document.getElementById("studentChart");
        if (!canvas || typeof Chart === "undefined") return;

        if (this.studentChartInstance) {
            this.studentChartInstance.destroy();
        }

        // Check if we have AI category scores
        if (latest.category_scores) {
            const labels = Object.keys(latest.category_scores);
            const data = Object.values(latest.category_scores);

            this.studentChartInstance = new Chart(canvas, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Skill Alignment',
                        data: data,
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        borderColor: '#6366f1',
                        pointBackgroundColor: '#6366f1',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255,255,255,0.1)' },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            pointLabels: { color: '#e5e7eb', font: { size: 12 } },
                            ticks: { display: false, max: 100, min: 0, stepSize: 20 },
                            suggestedMin: 0,
                            suggestedMax: 100
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        } else {
            // Fallback to doughnut
            const matched = latest.matched_skills?.length || 0;
            const missing = latest.missing_skills?.length || 0;

            this.studentChartInstance = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: ['Matched Skills', 'Missing Skills'],
                    datasets: [{
                        data: [matched, missing],
                        backgroundColor: ['#6366f1', '#f59e0b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { labels: { color: '#e5e7eb' } }
                    }
                }
            });
        }
    },

    renderRecruiterChart() {
        const filteredCandidates = this.getFilteredCandidates();
        const canvas = document.getElementById("recruiterChart");

        if (!canvas || typeof Chart === "undefined" || !filteredCandidates.length) {
            if (this.recruiterChartInstance) {
                this.recruiterChartInstance.destroy();
                this.recruiterChartInstance = null;
            }
            return;
        }

        if (this.recruiterChartInstance) {
            this.recruiterChartInstance.destroy();
        }

        this.recruiterChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: filteredCandidates.map(c => c.email),
                datasets: [{
                    label: 'Match Score',
                    data: filteredCandidates.map(c => c.match_score),
                    backgroundColor: '#6366f1',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: {
                        ticks: {
                            color: '#e5e7eb'
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.08)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: '#e5e7eb'
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.08)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e5e7eb'
                        }
                    }
                }
            }
        });
    },

    renderDashboardHeader() {
        const profile = this.getProfile();
        return `
            <header class="dashboard-top-nav glass-panel" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; margin-bottom: 2rem; border-radius: 16px; background: rgba(255,255,255,0.03);">
                <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-primary);">
                    <i class="ri-radar-line"></i> ResumeIQ
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div class="profile-trigger" onclick="App.navigate('dashboard-student/profile')" style="cursor: pointer; display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; border-radius: 12px; transition: background 0.3s ease;">
                        <div style="width: 35px; height: 35px; border-radius: 50%; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; overflow: hidden; font-weight: bold; font-size: 0.9rem;">
                            ${profile.photo ? `<img src="${profile.photo}" style="width: 100%; height: 100%; object-fit: cover;">` : (profile.name || "S").charAt(0).toUpperCase()}
                        </div>
                        <span style="font-size: 0.9rem; font-weight: 500;">${profile.name || "Student"}</span>
                    </div>
                </div>
            </header>
        `;
    },

    renderRecruiterOverview(allJobs, myJobs) {
        return `
            <div class="dashboard-header" style="margin-bottom: 2rem;">
                <h2 style="font-size: 2rem;">Recruitment Intelligence</h2>
                <p style="color: var(--text-secondary);">Real-time hiring analytics and system overview</p>
            </div>
            
            <div class="stats-grid" style="margin-bottom: 2.5rem;">
                <div class="glass-panel stat-card" style="border-bottom: 3px solid var(--accent-primary);">
                    <div class="stat-title">Active Postings <div style="color: var(--accent-primary);"><i class="ri-briefcase-4-line"></i></div></div>
                    <div class="stat-value">${myJobs.length}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Your active job roles</div>
                </div>
                <div class="glass-panel stat-card" style="border-bottom: 3px solid var(--accent-secondary);">
                    <div class="stat-title">Platform Jobs <div style="color: var(--accent-secondary);"><i class="ri-global-line"></i></div></div>
                    <div class="stat-value">${allJobs.length}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Total jobs in system</div>
                </div>
                <div class="glass-panel stat-card" style="border-bottom: 3px solid var(--success);">
                    <div class="stat-title">Processing Status <div style="color: var(--success);"><i class="ri-pulse-line"></i></div></div>
                    <div class="stat-value" style="font-size: 1.5rem; color: var(--success);">System Online</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">AI Services operational</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 2rem;">
                <div class="glass-panel" style="padding: 2rem;">
                    <h3 style="margin-bottom: 1.5rem;"><i class="ri-history-line"></i> Recent Activity</h3>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${myJobs.slice(0, 3).map(job => `
                            <div style="padding: 1rem; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600;">${job.title}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Posted to ${job.company}</div>
                                </div>
                                <div class="badge badge-primary">Active</div>
                            </div>
                        `).join('')}
                        ${!myJobs.length ? '<div style="color: var(--text-muted);">No recent activity.</div>' : ''}
                    </div>
                </div>

                <div class="glass-panel" style="padding: 2rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 1rem;">
                        <i class="ri-shield-user-line"></i>
                    </div>
                    <h4>Recruiter Verified</h4>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        Your account is verified for high-priority hiring.
                    </p>
                </div>
            </div>
        `;
    },

    render(view, params = {}) {
        const root = document.getElementById('app-root');

        switch (view) {
            case 'landing':
                root.innerHTML = Views.landing();
                break;
            case 'auth':
                root.innerHTML = Views.auth(params.subView);
                break;
            case 'dashboard-recruiter':
                if (!this.state.user || this.state.user.role !== 'recruiter') return this.navigate('auth/recruiter');
                root.innerHTML = Views.recruiterDashboard(
                    params.subView,
                    this.state.data.jobs || [],
                    this.state.data.myJobs || []
                );
                setTimeout(() => this.renderRecruiterChart(), 100);
                break;
            case 'dashboard-student':
                if (!this.state.user || this.state.user.role !== 'student') return this.navigate('auth/student');
                root.innerHTML = Views.studentDashboard(
                    params.subView,
                    this.state.data.resumes || [],
                    this.state.data.jobs || []
                );
                setTimeout(() => this.renderStudentChart(), 100);
                break;
            default:
                root.innerHTML = `
                    <div style="text-align: center; padding: 4rem;">
                        <h1 style="font-size: 3rem; margin-bottom: 1rem;">404</h1>
                        <p style="color: var(--text-secondary);">View not found.</p>
                        <button class="btn btn-primary" style="margin-top: 2rem;" onclick="App.navigate('landing')">Go Home</button>
                    </div>
                `;
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');

        let icon = 'ri-information-line';
        let color = 'var(--accent-primary)';

        if (type === 'success') { icon = 'ri-checkbox-circle-line'; color = 'var(--success)'; }
        if (type === 'warning') { icon = 'ri-error-warning-line'; color = 'var(--warning)'; }
        if (type === 'error') { icon = 'ri-close-circle-line'; color = 'var(--danger)'; }

        toast.style.cssText = `
            background: var(--bg-surface);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-glass);
            border-left: 4px solid ${color};
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;

        toast.innerHTML = `
            <i class="${icon}" style="color: ${color}; font-size: 1.25rem;"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

/**
 * View Components
 */
const Views = {
    landing() {
        return `
        <div class="hero" style="min-height: 80vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--bg-glass); border: 1px solid var(--border-glass); border-radius: 99px; margin-bottom: 2rem;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 10px var(--success);"></span>
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);">AI Resume Analyser • System Live</span>
            </div>
            
            <h1 style="font-size: clamp(3rem, 6vw, 5rem); font-weight: 800; letter-spacing: -1px; margin-bottom: 1.5rem; line-height: 1.1;">
                AI Resume <br />
                <span class="text-gradient">Analyser</span>
            </h1>
            
            <p style="font-size: 1.2rem; color: var(--text-secondary); max-width: 720px; margin-bottom: 3rem;">
                An advanced AI-powered resume analysis platform that helps students identify skill gaps, improve job readiness, and helps recruiters rank candidates fairly based on real skill match.
            </p>
            
            <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; justify-content: center;">
                <button class="btn btn-primary" style="padding: 1rem 2rem; font-size: 1.1rem; border-radius: 12px;" onclick="App.navigate('auth/recruiter')">
                    <i class="ri-building-line"></i> Recruiter Portal
                </button>
                <button class="btn btn-outline" style="padding: 1rem 2rem; font-size: 1.1rem; border-radius: 12px;" onclick="App.navigate('auth/student')">
                    <i class="ri-graduation-cap-line"></i> Student Portal
                </button>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 4rem 0;">
            <div class="glass-panel" style="padding: 2.5rem; text-align: left;">
                <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(99, 102, 241, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="ri-brain-line"></i>
                </div>
                <h3 style="margin-bottom: 1rem; font-size: 1.5rem;">AI-Powered Parsing</h3>
                <p style="color: var(--text-secondary);">
                    AI-Powered Parsing reads resumes and extracts important skills, technologies, and experience so students and recruiters can understand resume strength clearly.
                </p>
            </div>

            <div class="glass-panel" style="padding: 2.5rem; text-align: left;">
                <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(168, 85, 247, 0.1); color: var(--accent-secondary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="ri-scales-3-line"></i>
                </div>
                <h3 style="margin-bottom: 1rem; font-size: 1.5rem;">Bias-Free Ranking</h3>
                <p style="color: var(--text-secondary);">
                    Bias-Free Ranking compares resumes with job requirements based on skills and relevance, helping recruiters evaluate candidates more fairly and transparently.
                </p>
            </div>

            <div class="glass-panel" style="padding: 2.5rem; text-align: left;">
                <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(34, 197, 94, 0.1); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="ri-road-map-line"></i>
                </div>
                <h3 style="margin-bottom: 1rem; font-size: 1.5rem;">Skill Gap Guidance</h3>
                <p style="color: var(--text-secondary);">
                    Students can view matched and missing skills for each job, helping them understand what to learn next for better placement chances.
                </p>
            </div>
        </div>
    `;
    },

    auth(roleStr = 'student') {
        const role = roleStr === 'recruiter' ? 'recruiter' : 'student';
        const isRecruiter = role === 'recruiter';
        const isLoading = App.state.data.isLoading;

        return `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 70vh;">
                <div class="glass-panel" style="width: 100%; max-width: 520px; padding: 3rem; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: -50px; right: -50px; width: 100px; height: 100px; border-radius: 50%; background: ${isRecruiter ? 'var(--accent-primary)' : 'var(--accent-secondary)'}; filter: blur(50px); opacity: 0.5;"></div>
                    
                    <div style="text-align: center; margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem; margin-bottom: 0.5rem;">
                            <span class="text-gradient">${isRecruiter ? 'Recruiter' : 'Candidate'}</span> Portal
                        </h2>
                        <p style="color: var(--text-secondary);">Create account or sign in</p>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                        <button class="btn btn-outline" type="button" onclick="document.getElementById('signin-box').style.display='block'; document.getElementById('signup-box').style.display='none';" ${isLoading ? 'disabled' : ''}>
                            Sign In
                        </button>
                        <button class="btn btn-outline" type="button" onclick="document.getElementById('signin-box').style.display='none'; document.getElementById('signup-box').style.display='block';" ${isLoading ? 'disabled' : ''}>
                            Sign Up
                        </button>
                    </div>

                    <div id="signin-box" style="display: block;">
                        <form onsubmit="App.handleLogin(event, '${role}')">
                            <div class="form-group">
                                <label class="form-label">Email Address</label>
                                <input id="login-email" type="email" class="form-control" placeholder="user@example.com" required ${isLoading ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Password</label>
                                <input id="login-password" type="password" class="form-control" placeholder="••••••••" required ${isLoading ? 'disabled' : ''}>
                            </div>

                            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.8rem; font-size: 1.1rem; border-radius: 8px;" ${isLoading ? 'disabled' : ''}>
                                ${isLoading ? 'Signing In...' : 'Sign In'}
                            </button>
                        </form>
                    </div>

                    <div id="signup-box" style="display: none;">
                        <form onsubmit="App.handleSignup(event, '${role}')">
                            <div class="form-group">
                                <label class="form-label">Email Address</label>
                                <input id="signup-email" type="email" class="form-control" placeholder="user@example.com" required ${isLoading ? 'disabled' : ''}>
                            </div>
                           <div class="form-group">
    <label class="form-label">Password</label>
    <input id="signup-password" type="password" class="form-control" placeholder="Enter password" required>

    <small style="color: var(--text-secondary); font-size: 0.8rem;">
        6–72 chars, include uppercase, lowercase, number & special character
    </small>
</div>
                           <div class="form-group">
    <label class="form-label">Confirm Password</label>
    <input id="signup-confirm-password" type="password" class="form-control" placeholder="Re-enter password" required ${isLoading ? 'disabled' : ''}>
</div>

<div class="form-group">
    <label class="form-label">OTP</label>
    <input id="signup-otp" class="form-control" placeholder="Enter OTP">
</div>

<button type="button" class="btn btn-secondary" onclick="App.sendOtp()" style="margin-bottom: 1rem;">
    Send OTP
</button>

                            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.8rem; font-size: 1.1rem; border-radius: 8px;" ${isLoading ? 'disabled' : ''}>
                                ${isLoading ? 'Creating Account...' : 'Create Account'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    recruiterDashboard(subView, jobs = [], myJobs = []) {
        let content = '';
        const isLoading = App.state.data.isLoading;

        switch (subView) {
            case 'overview':
                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem;">Overview</h2>
                        <p style="color: var(--text-secondary);">Recruiter workspace</p>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="glass-panel stat-card">
                            <div class="stat-title">My Jobs <div style="color: var(--accent-primary);"><i class="ri-briefcase-4-line"></i></div></div>
                            <div class="stat-value">${myJobs.length}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Your posted jobs</div>
                        </div>
                        <div class="glass-panel stat-card">
                            <div class="stat-title">All Jobs <div style="color: var(--accent-secondary);"><i class="ri-file-list-3-line"></i></div></div>
                            <div class="stat-value">${jobs.length}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Visible job listings</div>
                        </div>
                    </div>
                `;
                break;

            case 'candidates': {
                const jobResults = App.state.data.jobResults;
                const selectedJobId = App.state.data.selectedJobId;
                const candidateSort = App.state.data.candidateSort;
                const candidateMinScore = App.state.data.candidateMinScore;
                const candidateSearch = App.state.data.candidateSearch;
                const filteredCandidates = App.getFilteredCandidates();

                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem;">Ranked Candidates</h2>
                        <p style="color: var(--text-secondary);">View analyzed resumes for a selected job</p>
                    </div>

                    <div class="glass-panel" style="padding: 2rem; margin-bottom: 2rem;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label">Select Job</label>
                                <select class="form-control" onchange="App.handleSelectRecruiterJob(this.value)" ${isLoading ? 'disabled' : ''}>
                                    <option value="">Choose a job</option>
                                    ${myJobs.map(job => `
                                        <option value="${job.id}" ${selectedJobId === job.id ? 'selected' : ''}>
                                            ${job.title} - ${job.company}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Sort By</label>
                                <select class="form-control" onchange="App.handleCandidateSortChange(this.value)" ${isLoading ? 'disabled' : ''}>
                                    <option value="high_to_low" ${candidateSort === "high_to_low" ? "selected" : ""}>Highest Score</option>
                                    <option value="low_to_high" ${candidateSort === "low_to_high" ? "selected" : ""}>Lowest Score</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Min Score: <span id="min-score-val">${candidateMinScore}%</span></label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value="${candidateMinScore}"
                                    class="form-control"
                                    oninput="document.getElementById('min-score-val').innerText = this.value + '%'"
                                    id="filter-min-score"
                                    ${isLoading ? 'disabled' : ''}
                                />
                            </div>

                            <div class="form-group">
                                <label class="form-label">Search Email (Optional)</label>
                                <input
                                    type="text"
                                    id="filter-search-email"
                                    class="form-control"
                                    placeholder="Enter partial email"
                                    ${isLoading ? 'disabled' : ''}
                                />
                            </div>

                            <div class="form-group">
                                <label class="form-label">Target Hires</label>
                                <input
                                    type="number"
                                    id="filter-target-hires"
                                    class="form-control"
                                    placeholder="e.g. 5"
                                    value="5"
                                    ${isLoading ? 'disabled' : ''}
                                />
                            </div>

                            <div class="form-group" style="display: flex; align-items: flex-end;">
                                <button class="btn btn-primary" style="width: 100%;" onclick="App.applyRecruiterFilters()">
                                    <i class="ri-search-line"></i> Start Searching
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="glass-panel" style="padding: 1.5rem;">
                        ${!myJobs.length ? `
                            <div style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                                No jobs posted yet.
                            </div>
                        ` : !jobResults ? `
                            <div style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                                Select a job to view candidate results.
                            </div>
                        ` : `
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                                <div>
                                    <h3 style="margin-bottom: 0.25rem;">${jobResults.job_title}</h3>
                                    <p style="color: var(--text-secondary);">
                                        ${jobResults.company} • Total: ${jobResults.total_candidates} • Filtered: ${filteredCandidates.length}
                                    </p>
                                </div>
                                
                                <div style="display: flex; gap: 0.75rem;">
                                    <button class="btn btn-primary" onclick="App.handleSendBulkEmail()" ${!filteredCandidates.length ? 'disabled' : ''}>
                                        <i class="ri-mail-send-line"></i> Send Request to All
                                    </button>
                                </div>
                            </div>

                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Candidate Email</th>
                                        <th>Resume</th>
                                        <th>Match Score</th>
                                        <th>Matched Skills</th>
                                        <th>Missing Skills</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filteredCandidates.length ? filteredCandidates.map((candidate, index) => `
                                        <tr>
                                            <td>
                                                ${candidate.email}
                                                ${index === 0 ? `<div style="margin-top: 0.35rem;"><span class="badge badge-success">Top Match</span></div>` : ``}
                                            </td>
                                            <td>${candidate.filename}</td>
                                            <td>
                                                <div style="min-width: 130px;">
                                                    <div style="margin-bottom: 0.35rem;">
                                                        <span class="badge badge-primary">${candidate.match_score}%</span>
                                                    </div>
                                                    <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
                                                        <div style="height: 100%; width: ${candidate.match_score}%; background: var(--accent-primary); border-radius: 999px;"></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>${(candidate.matched_skills || []).join(', ') || '-'}</td>
                                            <td>${(candidate.missing_skills || []).join(', ') || '-'}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="5" style="text-align:center; color: var(--text-secondary);">
                                                No candidates match the current filters.
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        `}
                    </div>
                `;
                break;
            }

            case 'jobs':
                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem;">Job Postings</h2>
                        <p style="color: var(--text-secondary);">Create and manage recruiter jobs</p>
                    </div>

                    <div class="glass-panel" style="padding: 2rem; margin-bottom: 2rem;">
                        <h3 style="margin-bottom: 1rem;">Create New Job</h3>
                        <form onsubmit="App.handleCreateJob(event)">
                            <div class="form-group">
                                <label class="form-label">Job Title</label>
                                <input id="job-title" type="text" class="form-control" placeholder="Python Backend Developer" required ${isLoading ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Company</label>
                                <input id="job-company" type="text" class="form-control" placeholder="TechNova" required ${isLoading ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Job Description</label>
                                <textarea id="job-description" class="form-control" rows="5" placeholder="We need a backend developer with Python, FastAPI, MongoDB, SQL, Docker and Git." required ${isLoading ? 'disabled' : ''}></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary" ${isLoading ? 'disabled' : ''}>
                                <i class="ri-add-line"></i> ${isLoading ? 'Creating...' : 'Create Job'}
                            </button>
                        </form>
                    </div>

                    <div class="glass-panel" style="padding: 1.5rem;">
                        <h3 style="margin-bottom: 1rem;">My Posted Jobs</h3>
                        <table class="data-table">
                            <thead><tr><th>Job Title</th><th>Company</th><th>Required Skills</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${myJobs.length ? myJobs.map(j => `
                                    <tr>
                                        <td><strong>${j.title}</strong></td>
                                        <td>${j.company}</td>
                                        <td>${(j.required_skills || []).join(', ')}</td>
                                        <td>
                                            <button class="btn btn-outline btn-sm" onclick="App.handleDeleteJob('${j.id}')" style="color: var(--danger); border-color: var(--danger);">
                                                <i class="ri-delete-bin-line"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('') : `
                                    <tr>
                                        <td colspan="3" style="text-align:center; color: var(--text-secondary);">No jobs posted yet.</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
                break;
            case 'overview':
                content = App.renderRecruiterOverview(jobs, myJobs);
                break;
        }

        return `
            <div class="dashboard-layout">
                <aside class="sidebar glass-panel">
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 0.9rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px;">Recruitment Tool</h3>
                    </div>
                    <ul class="sidebar-menu">
                        <li class="${subView === 'overview' ? 'active' : ''}"><a href="#dashboard-recruiter/overview"><i class="ri-dashboard-line"></i> Overview</a></li>
                        <li class="${subView === 'jobs' ? 'active' : ''}"><a href="#dashboard-recruiter/jobs"><i class="ri-briefcase-line"></i> Job Postings</a></li>
                        <li class="${subView === 'candidates' ? 'active' : ''}"><a href="#dashboard-recruiter/candidates"><i class="ri-group-line"></i> Ranked Candidates</a></li>
                    </ul>
                </aside>
                
                <div class="dashboard-content" style="animation: fadeIn var(--transition-fast);">
                    ${this.renderDashboardHeader()}
                    ${content}
                </div>
            </div>
        `;
    },

    studentDashboard(subView, resumes = [], jobs = []) {
        let content = '';
        resumes = App.state.data.resumes || App.state.data.analysisHistory || resumes || [];
        const latestResume = resumes.length > 0 ? resumes[0] : null;
        const isLoading = App.state.data.isLoading;
        const jobRecommendation = App.getBestJobMatch(resumes);

        console.log("Final resumes:", resumes);

        switch (subView) {
            case 'overview':
                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem;">Student Portal</h2>
                        <p style="color: var(--text-secondary);">Upload resumes and track real analysis results</p>
                    </div>
                    
                    <div class="stats-grid" style="margin-bottom: 2rem;">
                        <div class="glass-panel stat-card">
                            <div class="stat-title">Saved Analyses <div style="color: var(--accent-secondary);"><i class="ri-file-chart-line"></i></div></div>
                            <div class="stat-value">${resumes.length}</div>
                        </div>
                    </div>
                    
                    <div class="glass-panel" style="padding: 2rem;">
                        ${jobRecommendation && jobRecommendation.best ? `
    <div class="glass-panel" style="padding: 2rem; margin-bottom: 2rem;">
        <h3 style="margin-bottom: 1rem;">
            <i class="ri-trophy-line" style="color: var(--warning);"></i>
            Best Opportunity For You
        </h3>

        <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
            <div>
                <h4 style="font-size: 1.3rem;">
                    ${jobRecommendation.best.job_title}
                </h4>
                <p style="color: var(--text-secondary);">
                    ${jobRecommendation.best.company}
                </p>
                <p style="margin-top: 0.5rem; color: var(--text-secondary);">
                    This is your best matching job. Focus on missing skills to improve your chances.
                </p>
            </div>

            <div style="text-align:center;">
                <div style="font-size: 2rem; font-weight: bold; color: var(--warning);">
                    ${jobRecommendation.best.match_score}%
                </div>
                <div style="font-size: 0.8rem;">Best Match</div>
            </div>
        </div>
    </div>

    <div class="glass-panel" style="padding: 2rem; margin-bottom: 2rem;">
        <h3>📊 Job Ranking</h3>

        <div style="margin-top:1rem;">
            ${jobRecommendation.all.map((job, index) => `
                <div style="padding:1rem; border:1px solid var(--border-glass); border-radius:10px; margin-bottom:10px;">
                    <strong>#${index + 1}</strong> 
                    ${job.job_title} at ${job.company}
                    <span style="float:right;">${job.match_score}%</span>
                </div>
            `).join('')}
        </div>
    </div>
` : ''}
                        <div style="display: grid; gap: 1rem;">
                            ${jobs.length
                        ? jobs.map(job => `
                                    <div style="padding: 1.5rem; border: 1px solid var(--border-glass-strong); border-radius: 12px; background: rgba(0,0,0,0.2); display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <h4 style="font-size: 1.2rem; margin-bottom: 0.25rem;">${job.title}</h4>
                                            <p style="color: var(--text-secondary); font-size: 0.9rem;">
                                                ${job.company} &bull; Requires: ${(job.required_skills || []).join(', ')}
                                            </p>
                                        </div>
                                        <div>
                                            <button class="btn btn-primary" onclick="App.handleAnalyze('${job.id}')" ${isLoading ? 'disabled' : ''}>
                                                <i class="ri-upload-cloud-line"></i> ${isLoading ? 'Analyzing...' : 'Upload Resume to Analyze'}
                                            </button>
                                        </div>
                                    </div>
                                `).join('')
                        : `<div style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                                    No jobs available yet.
                                   </div>`
                    }
                        </div>
                    </div>

                    ${latestResume ? `
                        <div class="glass-panel" style="padding: 2.5rem; margin-top: 2rem; animation: slideUp 0.5s ease-out;">
                            <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 3rem; align-items: start;">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                                        <div style="width: 45px; height: 45px; border-radius: 10px; background: rgba(99, 102, 241, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                            <i class="ri-ai-generate"></i>
                                        </div>
                                        <h3 style="font-size: 1.5rem;">AI Analysis Summary</h3>
                                    </div>
                                    
                                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 2rem; font-size: 1.1rem; padding-left: 0.5rem; border-left: 3px solid var(--accent-primary);">
                                        ${latestResume.analysis_summary || 'Our AI has analyzed your resume against the job requirements. Here is how you stack up.'}
                                    </p>

                                    <div style="display: grid; gap: 1.5rem;">
                                        <div>
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.65rem;">
                                                <span style="font-weight: 600;">Overall Fit Score</span>
                                                <span style="color: var(--accent-primary); font-weight: 800; font-size: 1.2rem;">${latestResume.match_score}%</span>
                                            </div>
                                            <div style="height: 12px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; border: 1px solid var(--border-glass);">
                                                <div style="height: 100%; width: ${latestResume.match_score}%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); border-radius: 999px;"></div>
                                            </div>
                                        </div>

                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                                            <div>
                                                <h4 style="margin-bottom: 0.75rem; font-size: 0.85rem; text-transform: uppercase; color: var(--success); letter-spacing: 1px;">Top Matched Skills</h4>
                                                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                                    ${(latestResume.matched_skills || []).length
                            ? latestResume.matched_skills.slice(0, 8).map(skill => `<span class="badge badge-success" style="padding: 0.4rem 0.8rem;">${skill}</span>`).join('')
                            : `<span style="color: var(--text-muted); font-style: italic;">No direct matches found</span>`
                        }
                                                </div>
                                            </div>

                                            <div>
                                                <h4 style="margin-bottom: 0.75rem; font-size: 0.85rem; text-transform: uppercase; color: var(--warning); letter-spacing: 1px;">Key Skill Gaps</h4>
                                                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                                    ${(latestResume.missing_skills || []).length
                            ? latestResume.missing_skills.slice(0, 8).map(skill => `<span class="badge badge-warning" style="padding: 0.4rem 0.8rem;">${skill}</span>`).join('')
                            : `<span style="color: var(--success); font-weight: 500;">✓ All requirements met</span>`
                        }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="glass-panel" style="padding: 1.5rem; text-align: center; background: rgba(255,255,255,0.02);">
                                    <h4 style="margin-bottom: 1.5rem; color: var(--text-secondary);">Role Alignment Radar</h4>
                                    <div style="position: relative; height: 280px; width: 100%;">
                                        <canvas id="studentChart"></canvas>
                                    </div>
                                    <p style="margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                        This chart compares your profile against ideal benchmarks for this role.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                `;
                break;

            case 'applications':
                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <h2 style="font-size: 2rem;">Resume Analysis History</h2>
                    </div>
                    
                    <div class="glass-panel" style="overflow-x: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Job</th>
                                    <th>Company</th>
                                    <th>Match Score</th>
                                    <th>Matched Skills</th>
                                    <th>Missing Skills</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${resumes.length ? resumes.map(resume => `
                                <tr>
                                    <td><strong>${resume.filename}</strong></td>
                                    <td>${resume.job_title || '-'}</td>
                                    <td>${resume.company || '-'}</td>
                                    <td>
                                        <div style="min-width: 130px;">
                                            <div style="margin-bottom: 0.35rem;">
                                                <span class="badge badge-primary">${resume.match_score}%</span>
                                            </div>
                                            <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
                                                <div style="height: 100%; width: ${resume.match_score}%; background: var(--accent-primary); border-radius: 999px;"></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${resume.matched_skills.join(', ') || '-'}</td>
                                    <td>${resume.missing_skills.join(', ') || '-'}</td>
                                    <td>
                                        <button class="btn btn-outline btn-sm" onclick="App.handleDeleteResume('${resume.job_id}')" style="color: var(--danger); border-color: var(--danger); padding: 0.2rem 0.5rem;">
                                            <i class="ri-delete-bin-line"></i>
                                        </button>
                                    </td>
                                </tr>
                                `).join('') : `
                                <tr>
                                    <td colspan="6" style="text-align:center; color: var(--text-secondary);">No resume analyses yet.</td>
                                </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'improve':
                if (!latestResume) {
                    content = `
            <div class="glass-panel" style="padding: 3rem; text-align: center;">
                <h2 style="margin-bottom: 1rem;">No Analysis Found</h2>
                <p style="color: var(--text-secondary);">
                    Upload and analyze a resume first to get AI-powered improvement insights.
                </p>
            </div>
        `;
                } else {
                    const missing = latestResume.missing_skills || [];
                    const matched = latestResume.matched_skills || [];

                    content = `
            <div class="dashboard-header" style="margin-bottom: 2rem;">
                <h2 style="font-size: 2rem;">AI Skill Gap Roadmap</h2>
                <p style="color: var(--text-secondary);">
                    Personalized learning guidance for 
                    <strong>${latestResume.job_title || 'selected job'}</strong>
                    at <strong>${latestResume.company || 'selected company'}</strong>
                </p>
            </div>

            <div class="stats-grid" style="margin-bottom: 2rem;">
                <div class="glass-panel stat-card">
                    <div class="stat-title">Match Score</div>
                    <div class="stat-value">${latestResume.match_score}%</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                        Current readiness for this job
                    </div>
                </div>

                <div class="glass-panel stat-card">
                    <div class="stat-title">Matched Skills</div>
                    <div class="stat-value">${matched.length}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                        Skills already found in your resume
                    </div>
                </div>

                <div class="glass-panel stat-card">
                    <div class="stat-title">Missing Skills</div>
                    <div class="stat-value">${missing.length}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                        Skills to improve for this post
                    </div>
                </div>
            </div>

            <div class="glass-panel" style="padding: 2.5rem; margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem;">
                    <i class="ri-check-double-line" style="color: var(--success);"></i>
                    Skills You Already Match
                </h3>

                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    ${matched.length
                            ? matched.map(skill => `<span class="badge badge-success">${skill}</span>`).join('')
                            : `<span style="color: var(--text-secondary);">No matched skills found yet.</span>`
                        }
                </div>
            </div>

            <div class="glass-panel" style="padding: 2.5rem; margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1.5rem;">
                    <i class="ri-road-map-line" style="color: var(--accent-primary);"></i>
                    Missing Skills Learning Roadmap
                </h3>

                ${missing.length === 0 ? `
                    <p style="color: var(--success);">
                        Great job! Your resume already matches all required skills for this job.
                    </p>
                ` : `
                    <div style="display: grid; gap: 1.5rem;">
                        ${missing.map(skill => {
                            const guide = App.getSkillRoadmap(skill);
                            return `
                                <div style="padding: 1.5rem; border: 1px solid var(--border-glass-strong); border-radius: 16px; background: rgba(0,0,0,0.18);">
                                    <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                                        <div>
                                            <h4 style="font-size: 1.25rem; margin-bottom: 0.35rem; text-transform: capitalize;">
                                                ${skill}
                                            </h4>
                                            <p style="color: var(--text-secondary); font-size: 0.95rem;">
                                                ${guide.why}
                                            </p>
                                        </div>
                                        <span class="badge badge-warning">Learn This</span>
                                    </div>

                                    <div style="margin-top: 1rem;">
                                        <h5 style="margin-bottom: 0.75rem;">Learning Steps</h5>
                                <div style="margin-bottom: 1.5rem; padding: 1.5rem; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass);">
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
                                        <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(99, 102, 241, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                            <i class="ri-lightbulb-line"></i>
                                        </div>
                                        <h4 style="font-size: 1.2rem;">${skill} Roadmap</h4>
                                    </div>

                                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.95rem; line-height: 1.6;">
                                        ${guide.why}
                                    </p>

                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                                        <div class="glass-panel" style="padding: 1.5rem; background: rgba(255,255,255,0.02);">
                                            <h5 style="margin-bottom: 1.25rem; color: var(--accent-primary); display: flex; align-items: center; gap: 0.5rem;">
                                                <i class="ri-direction-line"></i> Learning Path
                                            </h5>
                                            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                                                ${guide.phases.map((phase, pIdx) => `
                                                    <div>
                                                        <div style="font-size: 0.8rem; text-transform: uppercase; color: var(--accent-primary); font-weight: bold; margin-bottom: 0.5rem;">
                                                            Phase ${pIdx + 1}: ${phase.title}
                                                        </div>
                                                        <ul style="list-style: none; padding: 0;">
                                                            ${phase.steps.map(step => `
                                                                <li style="margin-bottom: 0.5rem; display: flex; gap: 0.75rem; font-size: 0.9rem; color: var(--text-secondary);">
                                                                    <i class="ri-checkbox-circle-line" style="color: var(--accent-primary); font-size: 1rem;"></i>
                                                                    ${step}
                                                                </li>
                                                            `).join('')}
                                                        </ul>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>

                                        <div class="glass-panel" style="padding: 1.5rem; background: rgba(255,255,255,0.02);">
                                            <h5 style="margin-bottom: 1.25rem; color: var(--accent-secondary); display: flex; align-items: center; gap: 0.5rem;">
                                                <i class="ri-hammer-line"></i> Mini Projects
                                            </h5>
                                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                                ${guide.projects.map(proj => `
                                                    <div style="padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border-glass);">
                                                        <div style="font-weight: 600; margin-bottom: 0.25rem; color: var(--text-primary);">${proj.name}</div>
                                                        <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">${proj.desc}</div>
                                                    </div>
                                                `).join('')}
                                            </div>

                                            <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--warning); display: flex; align-items: center; gap: 0.5rem;">
                                                <i class="ri-links-line"></i> Top Resources
                                            </h5>
                                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                                ${guide.resources.map(res => `
                                                    <span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);">${res}</span>
                                                `).join('')}
                                            </div>
                                        </div>

                                        <div class="glass-panel" style="padding: 1.5rem; background: rgba(255,255,255,0.02);">
                                            <h5 style="margin-bottom: 1.25rem; color: var(--success); display: flex; align-items: center; gap: 0.5rem;">
                                                <i class="ri-question-answer-line"></i> Interview Prep
                                            </h5>
                                            <ul style="list-style: none; padding: 0;">
                                                ${guide.interview.map(q => `
                                                    <li style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-size: 0.9rem; color: var(--text-secondary);">
                                                        <div style="display: flex; gap: 0.75rem;">
                                                            <i class="ri-chat-voice-line" style="color: var(--success); flex-shrink: 0;"></i> 
                                                            <span>${q}</span>
                                                        </div>
                                                        <button class="btn btn-outline btn-sm" onclick="App.startInterview('${skill}', '${q.replace(/'/g, "\\'")}')" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;">
                                                            Start <i class="ri-arrow-right-line"></i>
                                                        </button>
                                                    </li>
                                                `).join('')}
                                            </ul>
                                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-glass);">
                                                <i class="ri-information-line"></i> Practice these questions to gain confidence before the real interview.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>

        `;
                }
                break;
            case 'assistant':
                content = `
        <div class="dashboard-header" style="margin-bottom: 2rem;">
            <h2 style="font-size: 2rem;">AI Career Assistant</h2>
            <p style="color: var(--text-secondary);">
                Ask questions about your resume, missing skills, roadmap, and interview preparation.
            </p>
        </div>

        <div class="glass-panel" style="padding: 2rem;">
            <div id="chatbot-messages" style="height: 360px; overflow-y: auto; padding: 1rem; border: 1px solid var(--border-glass); border-radius: 12px; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 1rem; text-align: left;">
                    <div style="display: inline-block; background: rgba(255,255,255,0.08); padding: 0.75rem 1rem; border-radius: 12px; max-width: 80%; color: var(--text-secondary);">
                        Hi! I am your AI Career Assistant. Ask me about missing skills, roadmap, resume improvement, or interview preparation.
                    </div>
                </div>
            </div>

            <form onsubmit="App.handleChatbotQuestion(event)" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <input id="chatbot-input" class="form-control" style="flex: 1;" placeholder="Ask: What skills am I missing?">
                <button type="submit" class="btn btn-primary">
                    <i class="ri-send-plane-line"></i> Ask
                </button>
            </form>
        </div>
    `;
                break;

            case 'profile': {
                const profile = App.getProfile();

                content = `
        <div class="dashboard-header" style="margin-bottom: 2rem;">
            <h2 style="font-size: 2rem;">My Profile</h2>
            <p style="color: var(--text-secondary);">
                Manage your personal details, portfolio links, and education information.
            </p>
        </div>

        <div class="glass-panel" style="padding: 2.5rem; margin-bottom: 2rem;">
            <div style="display: flex; align-items: center; gap: 2rem; flex-wrap: wrap;">
                <div style="width: 110px; height: 110px; border-radius: 50%; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 2.5rem; font-weight: 700;">
                    ${profile.photo
                        ? `<img src="${profile.photo}" alt="Profile Photo" style="width: 100%; height: 100%; object-fit: cover;">`
                        : `${(profile.name || "S").charAt(0).toUpperCase()}`
                    }
                </div>

                <div>
                    <h3 style="font-size: 1.8rem; margin-bottom: 0.5rem;">
                        ${profile.name || "Student"}
                    </h3>
                    <p style="color: var(--text-secondary); margin-bottom: 0.35rem;">
                        ${profile.email}
                    </p>
                    <p style="color: var(--text-secondary);">
                        ${profile.education || "Education details not added yet"}
                    </p>
                </div>
            </div>

            <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 2rem;">
                ${profile.github ? `
                    <a class="btn btn-outline" href="${profile.github}" target="_blank">
                        <i class="ri-github-line"></i> GitHub
                    </a>
                ` : ''}

                ${profile.linkedin ? `
                    <a class="btn btn-outline" href="${profile.linkedin}" target="_blank">
                        <i class="ri-linkedin-box-line"></i> LinkedIn
                    </a>
                ` : ''}
            </div>
        </div>

        <div class="glass-panel" style="padding: 2.5rem;">
            <h3 style="margin-bottom: 1.5rem;">Edit Profile</h3>

            <form onsubmit="App.saveProfile(event)">
                <div class="form-group">
                    <label class="form-label">Full Name</label>
                    <input id="profile-name" class="form-control" type="text" value="${profile.name || ''}" placeholder="Your full name">
                </div>

                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input class="form-control" type="email" value="${profile.email}" disabled>
                </div>

                <div class="form-group">
                    <label class="form-label">GitHub URL</label>
                    <input id="profile-github" class="form-control" type="url" value="${profile.github || ''}" placeholder="https://github.com/username">
                </div>

                <div class="form-group">
                    <label class="form-label">LinkedIn URL</label>
                    <input id="profile-linkedin" class="form-control" type="url" value="${profile.linkedin || ''}" placeholder="https://linkedin.com/in/username">
                </div>

                <div class="form-group">
                    <label class="form-label">Education / Current Pursuing</label>
                    <input id="profile-education" class="form-control" type="text" value="${profile.education || ''}" placeholder="B.Tech IT, CBIT">
                </div>

               <div class="form-group">
    <label class="form-label">Upload Profile Photo</label>
    <input type="file" class="form-control" accept="image/*" onchange="App.handleProfilePhotoUpload(event)">
</div>

                <button type="submit" class="btn btn-primary">
                    <i class="ri-save-line"></i> Save Profile
                </button>
            </form>
        </div>
    `;
                break;
            }
            case 'interview': {
                const session = App.state.interview || {};
                const evalResult = session.evaluation;
                const isLoadingEval = App.state.data.isLoading;

                content = `
                    <div class="dashboard-header" style="margin-bottom: 2rem;">
                        <button class="btn btn-ghost" onclick="App.render('dashboard-student', {subView: 'improve'})" style="margin-bottom: 1rem;">
                            <i class="ri-arrow-left-line"></i> Back to Roadmap
                        </button>
                        <h2 style="font-size: 2rem;">Interview Practice: ${session.skill}</h2>
                    </div>

                    <div class="glass-panel" style="padding: 2.5rem; max-width: 800px; margin: 0 auto;">
                        <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(99, 102, 241, 0.05); border-left: 4px solid var(--accent-primary); border-radius: 8px;">
                            <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem; font-size: 0.9rem; text-transform: uppercase;">Interview Question</h4>
                            <p style="font-size: 1.2rem; font-weight: 500;">${session.question}</p>
                        </div>

                        ${evalResult ? `
                            <div style="margin-bottom: 2rem; animation: fadeIn 0.4s ease-out;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                    <h4 style="font-size: 1.1rem; color: ${evalResult.status === 'Correct' ? 'var(--success)' : evalResult.status === 'Incorrect' ? 'var(--danger)' : 'var(--warning)'}">
                                        ${evalResult.status === 'Correct' ? '✅ Correct' : evalResult.status === 'Incorrect' ? '❌ Incorrect' : '⚠️ ' + evalResult.status}
                                    </h4>
                                    <div class="badge badge-primary" style="font-size: 1.2rem; padding: 0.5rem 1rem;">Score: ${evalResult.score}%</div>
                                </div>

                                <div class="glass-panel" style="padding: 1.5rem; background: rgba(255,255,255,0.02); margin-bottom: 1.5rem;">
                                    <h5 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">Evaluation Explanation:</h5>
                                    <p style="line-height: 1.6;">${evalResult.explanation}</p>
                                </div>

                                <div class="glass-panel" style="padding: 1.5rem; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.1);">
                                    <h5 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--success);">Model Answer:</h5>
                                    <p style="line-height: 1.6; font-style: italic;">${evalResult.correct_answer}</p>
                                </div>

                                <button class="btn btn-primary" onclick="App.render('dashboard-student', {subView: 'improve'})" style="margin-top: 2rem; width: 100%;">
                                    Try Another Question
                                </button>
                            </div>
                        ` : `
                            <div class="form-group">
                                <label class="form-label">Your Answer</label>
                                <textarea id="interview-answer" class="form-control" rows="8" placeholder="Explain your answer here in detail..." ${isLoadingEval ? 'disabled' : ''}>${session.answer || ''}</textarea>
                                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Be specific and use technical terms where applicable.</p>
                            </div>

                            <button class="btn btn-primary" style="width: 100%; padding: 1rem;" onclick="App.handleEvaluateAnswer()" ${isLoadingEval ? 'disabled' : ''}>
                                ${isLoadingEval ? '<i class="ri-loader-4-line ri-spin"></i> Evaluating...' : 'Submit Answer for Review'}
                            </button>
                        `}
                    </div>
                `;
                break;
            }
        }

        return `
            <div class="dashboard-layout">
                <aside class="sidebar glass-panel">
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 0.9rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px;">Student Portal</h3>
                    </div>
                    <ul class="sidebar-menu">
                        <li class="${subView === 'overview' ? 'active' : ''}"><a href="#dashboard-student/overview"><i class="ri-dashboard-line"></i> Dashboard</a></li>
                        <li class="${subView === 'applications' ? 'active' : ''}"><a href="#dashboard-student/applications"><i class="ri-history-line"></i> Analysis History</a></li>
                        <li class="${subView === 'improve' ? 'active' : ''}"><a href="#dashboard-student/improve"><i class="ri-rocket-line"></i> Improvement Insights</a></li>
                        <li class="${subView === 'assistant' ? 'active' : ''}"><a href="#dashboard-student/assistant"><i class="ri-robot-2-line"></i> AI Assistant</a></li>
                    </ul>
                </aside>
                
                <div class="dashboard-content" style="animation: fadeIn var(--transition-fast);">
                    ${this.renderDashboardHeader()}
                    ${content}
                </div>
            </div>
        `;
    }
};

document.head.insertAdjacentHTML('beforeend', `
<style>
    .toast-container {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
    }
</style>`);

document.addEventListener('DOMContentLoaded', () => App.init());