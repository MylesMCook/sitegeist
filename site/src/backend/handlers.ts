import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { sealData } from "iron-session";
import type { Api, AuthRequest, HealthResponse, StatusResponse } from "../shared/api.js";
import type { EmailSignup, SignupRequest, SignupResponse } from "../shared/types.js";
import { getIronConfig, type SessionData } from "./auth-middleware.js";
import type { SettingsManager } from "./settings.js";
import type { FileStore } from "./storage.js";

// Email validation regex (basic)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): void {
	const now = Date.now();
	const attempt = loginAttempts.get(ip);

	if (attempt && now < attempt.resetAt) {
		if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
			const minutesLeft = Math.ceil((attempt.resetAt - now) / 60000);
			throw new Error(
				`Too many login attempts. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}`,
			);
		}
		attempt.count++;
	} else {
		loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
	}
}

function resetRateLimit(ip: string): void {
	loginAttempts.delete(ip);
}

/**
 * Create API handlers
 */
export function createHandlers(signupsStore: FileStore<EmailSignup[] | string>, settings: SettingsManager): Api {
	return {
		async health(): Promise<HealthResponse> {
			return {
				status: "healthy",
				timestamp: new Date().toISOString(),
			};
		},

		async status(): Promise<StatusResponse> {
			return {
				setupRequired: settings.isSetupRequired(),
			};
		},

		async setup(request: AuthRequest, _req: Request, res: Response): Promise<void> {
			// Check if already set up
			if (!settings.isSetupRequired()) {
				throw new Error("Setup already completed");
			}

			const { password } = request;

			if (!password || password.length < 6) {
				throw new Error("Password must be at least 6 characters");
			}

			// Hash password and generate Iron secret
			const passwordHash = await bcrypt.hash(password, 10);
			const ironSecret = crypto.randomBytes(32).toString("base64");

			// Save settings
			settings.setAuth(passwordHash, ironSecret);

			// Create session cookie
			const sessionData: SessionData = { authenticated: true };
			const sealed = await sealData(sessionData, { password: ironSecret });

			const config = getIronConfig(ironSecret);
			res.cookie(config.cookieName, sealed, config.cookieOptions);

			console.log("✓ Setup completed, admin session created");
		},

		async login(request: AuthRequest, req: Request, res: Response): Promise<void> {
			const { password } = request;
			const ip = req.ip || req.socket.remoteAddress || "unknown";

			// Check rate limit
			checkRateLimit(ip);

			// Check if setup is required first
			if (settings.isSetupRequired()) {
				throw new Error("Setup required");
			}

			const passwordHash = settings.getPasswordHash();
			const ironSecret = settings.getIronSecret();

			if (!passwordHash || !ironSecret) {
				throw new Error("Setup required");
			}

			// Verify password
			const valid = await bcrypt.compare(password, passwordHash);
			if (!valid) {
				throw new Error("Invalid password");
			}

			// Reset rate limit on successful login
			resetRateLimit(ip);

			// Create session cookie
			const sessionData: SessionData = { authenticated: true };
			const sealed = await sealData(sessionData, { password: ironSecret });

			const config = getIronConfig(ironSecret);
			res.cookie(config.cookieName, sealed, config.cookieOptions);

			console.log("✓ Admin logged in");
		},

		async logout(_body: unknown, _req: Request, res: Response): Promise<void> {
			const ironSecret = settings.getIronSecret();
			if (!ironSecret) {
				throw new Error("Setup required");
			}

			const config = getIronConfig(ironSecret);
			res.clearCookie(config.cookieName);

			console.log("✓ Admin logged out");
		},

		async signup(request: SignupRequest): Promise<SignupResponse> {
			const { email } = request;

			// Validate email format
			if (!email || typeof email !== "string") {
				throw new Error("Email is required");
			}

			if (!EMAIL_REGEX.test(email)) {
				throw new Error("Invalid email format");
			}

			// Get current signups array
			const signups = (signupsStore.getItem("signups") as EmailSignup[]) || [];

			// Check if email already exists
			const existingSignup = signups.find((signup) => signup.email.toLowerCase() === email.toLowerCase());

			if (existingSignup) {
				// Don't reveal that email is already registered - return success
				console.log(`✓ Duplicate signup attempt: ${email}`);
				return {
					success: true,
				};
			}

			// Create new signup
			const signup: EmailSignup = {
				email: email.toLowerCase(),
				timestamp: new Date().toISOString(),
				notified: false,
			};

			// Add to array and save
			signups.push(signup);
			signupsStore.setItem("signups", signups);

			console.log(`✓ New signup: ${signup.email}`);

			return {
				success: true,
			};
		},

		async listSignups(): Promise<EmailSignup[]> {
			const signups = (signupsStore.getItem("signups") as EmailSignup[]) || [];
			return signups;
		},
	};
}
