import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TABLE = "pickleball_registrations";
const FEE_PHP = 1000;
const MAX_REQUEST_BYTES = 32 * 1024;

const DIVISIONS = new Set([
  "Men's Doubles",
  "Women's Doubles",
  "Mixed Doubles"
]);

const BRACKETS = new Set([
  "Below 3.0",
  "3.0 – 3.49",
  "3.5 – 3.99",
  "4.0 and above",
  "No DUPR rating yet"
]);

const GENDERS = new Set(["Male", "Female"]);
const SHIRTS = new Set(["XS", "S", "M", "L", "XL", "2XL", "3XL"]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIMITS = {
  team_name: 120,
  division: 40,
  dupr_bracket: 40,
  club: 160,

  p1_name: 120,
  p1_gender: 10,
  p1_dob: 10,
  p1_phone: 11,
  p1_email: 254,
  p1_dupr: 24,
  p1_dupr_id: 80,
  p1_shirt: 5,

  p2_name: 120,
  p2_gender: 10,
  p2_dob: 10,
  p2_phone: 11,
  p2_email: 254,
  p2_dupr: 24,
  p2_dupr_id: 80,
  p2_shirt: 5,

  emergency_name: 120,
  emergency_phone: 11,
  emergency_relationship: 80,

  payment_ack: 10,
  waiver: 10,
  notes: 2000
};

function reply(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  return res.status(status).json(body);
}

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  return error;
}

function getDatabase() {
  const url = (process.env.SUPABASE_URL || "").trim();

  const key = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();

  if (!url || !key) {
    throw configError(
      "Missing SUPABASE_URL or Supabase server key."
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw configError("SUPABASE_URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw configError("SUPABASE_URL must use HTTPS.");
  }

  if (!key.startsWith("sb_secret_")) {
    let role;

    try {
      const payload = key.split(".")[1];

      role = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      ).role;
    } catch {
      throw configError(
        "Use a Supabase secret or legacy service_role key."
      );
    }

    // This checks key type only. Supabase validates the credential.
    if (role !== "service_role") {
      throw configError(
        "The configured server key is not service_role."
      );
    }
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  if (Number(value.slice(0, 4)) < 1) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  const todayInPhilippines = new Date(
    Date.now() + 8 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  return value <= todayInPhilippines;
}

function validateFields(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return { error: "Invalid registration fields." };
  }

  for (const [name, value] of Object.entries(input)) {
    if (
      !Object.hasOwn(LIMITS, name) ||
      typeof value !== "string" ||
      value.length > LIMITS[name] ||
      value.includes("\u0000")
    ) {
      return {
        error: `Registration contains an invalid field or excessive text.`
      };
    }
  }

  const fields = {};

  for (const name of Object.keys(LIMITS)) {
    fields[name] = (input[name] || "").trim();
  }

  if (!DIVISIONS.has(fields.division)) {
    return { error: "Please select a valid division." };
  }

  if (!BRACKETS.has(fields.dupr_bracket)) {
    return { error: "Please select a valid DUPR bracket." };
  }

  for (const key of ["p1", "p2"]) {
    const label = key === "p1" ? "Player 1" : "Player 2";

    if (!fields[`${key}_name`]) {
      return { error: `${label}: full name is required.` };
    }

    if (!GENDERS.has(fields[`${key}_gender`])) {
      return { error: `${label}: select a valid gender.` };
    }

    if (!validBirthDate(fields[`${key}_dob`])) {
      return {
        error: `${label}: enter a valid date of birth, not a future date.`
      };
    }

    if (!/^09[0-9]{9}$/.test(fields[`${key}_phone`])) {
      return {
        error: `${label}: mobile number must have 11 digits starting with 09.`
      };
    }

    const email = fields[`${key}_email`].toLowerCase();

    if (key === "p1" && !email) {
      return { error: "Player 1: email is required." };
    }

    if (email && !validEmail(email)) {
      return { error: `${label}: enter a valid email address.` };
    }

    fields[`${key}_email`] = email;

    const ratingText = fields[`${key}_dupr`];

    if (ratingText) {
      const rating = Number(ratingText);

      const validStep =
        Number.isFinite(rating) &&
        Math.abs(rating * 1000 - Math.round(rating * 1000)) < 0.000001;

      if (
        !validStep ||
        rating < 2 ||
        rating > 8
      ) {
        return {
          error:
            `${label}: DUPR rating must be between 2 and 8, ` +
            "with up to three decimal places."
        };
      }

      fields[`${key}_dupr`] = String(rating);
    }

    if (!SHIRTS.has(fields[`${key}_shirt`])) {
      return { error: `${label}: select a valid shirt size.` };
    }
  }

  const gender1 = fields.p1_gender;
  const gender2 = fields.p2_gender;

  const mismatch =
    (
      fields.division === "Mixed Doubles" &&
      gender1 === gender2
    ) ||
    (
      fields.division === "Men's Doubles" &&
      (gender1 !== "Male" || gender2 !== "Male")
    ) ||
    (
      fields.division === "Women's Doubles" &&
      (gender1 !== "Female" || gender2 !== "Female")
    );

  if (mismatch) {
    return {
      error: "Player genders do not match the selected division."
    };
  }

  if (!fields.emergency_name || !fields.emergency_relationship) {
    return {
      error: "Complete the emergency contact name and relationship."
    };
  }

  if (!/^09[0-9]{9}$/.test(fields.emergency_phone)) {
    return {
      error:
        "Emergency contact number must have 11 digits starting with 09."
    };
  }

  if (fields.payment_ack !== "yes") {
    return { error: "Please acknowledge the registration fee." };
  }

  if (fields.waiver !== "agreed") {
    return { error: "Both players must agree to the waiver." };
  }

  return { fields };
}

function canonicalJSON(value) {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]])
    )
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return reply(res, 405, {
      error: "Method not allowed."
    });
  }

  if (process.env.REGISTRATION_OPEN !== "true") {
    return reply(res, 503, {
      error:
        "Registration is currently closed. Please contact the organizer."
    });
  }

  const contentType = String(
    req.headers["content-type"] || ""
  ).split(";")[0].trim().toLowerCase();

  if (contentType !== "application/json") {
    return reply(res, 415, {
      error: "Submit registration data as JSON."
    });
  }

  const reference = randomUUID();

  try {
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return reply(res, 400, {
        error: "Invalid JSON request."
      });
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return reply(res, 400, {
        error: "Invalid registration request."
      });
    }

    if (
      Buffer.byteLength(JSON.stringify(body), "utf8") >
      MAX_REQUEST_BYTES
    ) {
      return reply(res, 413, {
        error: "Registration data is too large."
      });
    }

    if (
      typeof body.submissionId !== "string" ||
      !UUID_V4.test(body.submissionId)
    ) {
      return reply(res, 400, {
        error: "Invalid registration reference."
      });
    }

    const validation = validateFields(body.fields);

    if (validation.error) {
      return reply(res, 400, {
        error: validation.error
      });
    }

    const fields = validation.fields;
    const database = getDatabase();

    const { error } = await database
      .from(TABLE)
      .insert({
        id: body.submissionId,
        team_name: fields.team_name || null,
        division: fields.division,
        dupr_bracket: fields.dupr_bracket,
        form_data: fields,
        fee_due_php: FEE_PHP,
        payment_status: "unpaid"
      });

    if (error?.code === "23505") {
      // Resolve an identical retry without creating another row.
      const {
        data: existing,
        error: lookupError
      } = await database
        .from(TABLE)
        .select("form_data, fee_due_php, payment_status")
        .eq("id", body.submissionId)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      if (
        !existing ||
        canonicalJSON(existing.form_data) !== canonicalJSON(fields)
      ) {
        return reply(res, 409, {
          error:
            "Submission reference conflict. Contact the organizer."
        });
      }

      return reply(res, 200, {
        ok: true,
        registrationId: body.submissionId,
        feeDuePhp: existing.fee_due_php,
        paymentStatus: existing.payment_status
      });
    }

    if (error) {
      throw error;
    }

    return reply(res, 201, {
      ok: true,
      registrationId: body.submissionId,
      feeDuePhp: FEE_PHP,
      paymentStatus: "unpaid"
    });
  } catch (error) {
    // Avoid logging registrations, birth dates, or credentials.
    console.error("REGISTRATION_FAILED", {
      reference,
      code: error?.code || "SERVER_ERROR",
      configuration:
        error?.code === "CONFIG_ERROR"
          ? error.message
          : undefined
    });

    return reply(res, 500, {
      error:
        "Registration could not be confirmed. " +
        "Click Register Team again on this page to retry. " +
        `Reference: ${reference}`
    });
  }
}