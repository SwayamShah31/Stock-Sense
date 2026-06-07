import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'crypto';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return normalizeValue(value).replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '');
}

function splitEmailAddress(value) {
  const normalizedEmail = normalizeValue(value);
  const [localPart = '', ...domainParts] = normalizedEmail.split('@');

  return {
    localPart: normalizeUsername(localPart) || 'user',
    domain: domainParts.join('@') || 'gmail.com',
  };
}

function buildUsernameSeeds({ name, username, email }) {
  const emailParts = splitEmailAddress(email);
  return [...new Set([
    normalizeUsername(username),
    normalizeUsername(name?.split(' ')[0]),
    normalizeUsername(name?.replace(/\s+/g, '')),
    emailParts.localPart,
  ].filter((value) => value.length >= 3))];
}

function buildEmailSeeds({ name, username, email }) {
  const emailParts = splitEmailAddress(email);
  return [...new Set([
    emailParts.localPart,
    normalizeUsername(username),
    normalizeUsername(name?.replace(/\s+/g, '')),
  ].filter((value) => value.length >= 3))];
}

async function collectAvailableUsernames(baseSeeds, limit = 5) {
  const suggestions = [];
  const checked = new Set();
  const suffixes = ['', '1', '2', '7', `${randomInt(10, 99)}`, `${randomInt(100, 999)}`, `${new Date().getFullYear()}`];

  for (const base of baseSeeds) {
    for (const suffix of suffixes) {
      const candidate = `${base}${suffix}`.slice(0, 24);

      if (!candidate || checked.has(candidate)) {
        continue;
      }

      checked.add(candidate);

      if (!(await User.exists({ username: candidate }))) {
        suggestions.push(candidate);
      }

      if (suggestions.length >= limit) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

async function collectAvailableEmails(baseSeeds, domain, limit = 5) {
  const suggestions = [];
  const checked = new Set();
  const suffixes = ['', '1', '2', '7', `${randomInt(10, 99)}`, `${randomInt(100, 999)}`, `${new Date().getFullYear()}`];

  for (const base of baseSeeds) {
    for (const suffix of suffixes) {
      const localPart = `${base}${suffix}`.slice(0, 40);
      const candidate = `${localPart}@${domain}`;

      if (!localPart || checked.has(candidate)) {
        continue;
      }

      checked.add(candidate);

      if (!(await User.exists({ email: candidate }))) {
        suggestions.push(candidate);
      }

      if (suggestions.length >= limit) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

function createToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role, shopName: user.shopName },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export const register = asyncHandler(async (req, res) => {
  const { name, username, email, password, shopName, role } = req.body;

  if (!name || !username || !email || !password) {
    throw new HttpError(400, 'Name, username, email, and password are required');
  }

  const normalizedName = String(name).trim();
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeValue(email);

  if (normalizedUsername.length < 3) {
    throw new HttpError(400, 'Username must be at least 3 characters long');
  }

  const existingEmail = await User.findOne({ email: normalizedEmail });
  const existingUsername = await User.findOne({ username: normalizedUsername });

  if (existingEmail || existingUsername) {
    const suggestionSource = { name: normalizedName, username: normalizedUsername, email: normalizedEmail };
    const suggestions = {};

    if (existingUsername) {
      suggestions.usernames = await collectAvailableUsernames(buildUsernameSeeds(suggestionSource));
    }

    if (existingEmail) {
      const emailParts = splitEmailAddress(normalizedEmail);
      suggestions.emails = await collectAvailableEmails(buildEmailSeeds(suggestionSource), emailParts.domain);
    }

    const error = new HttpError(409, [existingUsername && 'Username already exists', existingEmail && 'Email already exists'].filter(Boolean).join(' and '));
    error.suggestions = suggestions;
    throw error;
  }

  const allowedRoles = new Set(['owner', 'manager', 'staff', 'customer']);
  const userRole = role && allowedRoles.has(role) ? role : 'owner';
  const resolvedShopName = userRole === 'customer' ? '' : (shopName || 'Main Store');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: normalizedName,
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    shopName: resolvedShopName,
    role: userRole,
  });

  res.status(201).json({
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      shopName: user.shopName,
      role: user.role,
    },
    token: createToken(user),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, email, username, password } = req.body;
  const loginIdentifier = normalizeValue(identifier || email || username);

  if (!loginIdentifier || !password) {
    throw new HttpError(400, 'Username/email and password are required');
  }

  const user = await User.findOne({
    $or: [{ email: loginIdentifier }, { username: normalizeUsername(loginIdentifier) }],
  });
  if (!user) {
    throw new HttpError(404, 'Account not registered');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new HttpError(401, 'Wrong password');
  }

  res.json({
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      shopName: user.shopName,
      role: user.role,
    },
    token: createToken(user),
  });
});
