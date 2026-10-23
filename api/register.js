import { randomUUID, createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import formidable from "formidable";
import { fileTypeFromBuffer } from "file-type";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false
  }
};

const TABLE = "pickleball_registrations";
const LOGO_BUCKET = "business-logos";

const FEE_PHP = 1000;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024;

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

const SHIRTS = new Set([
  "XS", "S", "M", "L", "XL", "2XL", "3XL"
]);

const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIMITS = {
  team_name: 120,
  division: 40,
  dupr_bracket: 40,
  club: 160,

  has_business: 3,
  wants_promotion: 3,
  business_name: 160,

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

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

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

    // Configuration check only; Supabase validates the credential.
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

function parseMultipartRequest(req, temporaryPaths) {
  const parser = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize: MAX_LOGO_BYTES,
    maxTotalFileSize: MAX_LOGO_BYTES,
    maxFields: 1,
    maxFieldsSize: MAX_PAYLOAD_BYTES,
    allowEmptyFiles: false,
    minFileSize: 1
  });

  // Track files even if parsing subsequently fails.
  parser.on("fileBegin", (_name, file) => {
    if (file.filepath) {
      temporaryPaths.add(file.filepath);
    }
  });

  return new Promise((resolve, reject) => {
    parser.parse(req, (error, fields, files) => {
      if (error) {
        reject(
          new RequestError(
            error.httpCode === 413 ? 413 : 400,
            error.httpCode === 413
              ? "Upload is too large. The logo limit is 2 MB."
              : "Could not read the upload. Select one image and retry."
          )
        );
        return;
      }

      if (
        Object.keys(fields).length !== 1 ||
        !Object.hasOwn(fields, "payload")
      ) {
        reject(
          new RequestError(400, "Missing registration payload.")
        );
        return;
      }

      const payloads = Array.isArray(fields.payload)
        ? fields.payload
        : [fields.payload];

      if (
        payloads.length !== 1 ||
        typeof payloads[0] !== "string" ||
        Buffer.byteLength(payloads[0], "utf8") > MAX_PAYLOAD_BYTES
      ) {
        reject(
          new RequestError(400, "Invalid registration payload.")
        );
        return;
      }

      if (
        Object.keys(files).some(
          (name) => name !== "business_logo"
        )
      ) {
        reject(
          new RequestError(400, "Unexpected uploaded file.")
        );
        return;
      }

      const logos = files.business_logo
        ? (
          Array.isArray(files.business_logo)
            ? files.business_logo
            : [files.business_logo]
        )
        : [];

      if (logos.length > 1) {
        reject(
          new RequestError(400, "Upload only one business logo.")
        );
        return;
      }

      let body;

      try {
        body = JSON.parse(payloads[0]);
      } catch {
        reject(
          new RequestError(400, "Invalid registration JSON.")
        );
        return;
      }

      resolve({
        body,
        uploadedFile: logos[0] || null
      });
    });
  });
}

function validBirthDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  const today = new Date(
    Date.now() + 8 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  return value <= today;
}

function validateFields(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new RequestError(400, "Invalid registration fields.");
  }

  for (const [name, value] of Object.entries(input)) {
    if (
      !Object.hasOwn(LIMITS, name) ||
      typeof value !== "string" ||
      value.length > LIMITS[name] ||
      value.includes("\u0000")
    ) {
      throw new RequestError(
        400,
        "Registration contains an invalid field or excessive text."
      );
    }
  }

  const fields = {};

  for (const name of Object.keys(LIMITS)) {
    fields[name] = (input[name] || "").trim();
  }

  if (!DIVISIONS.has(fields.division)) {
    throw new RequestError(400, "Please select a valid division.");
  }

  if (!BRACKETS.has(fields.dupr_bracket)) {
    throw new RequestError(
      400,
      "Please select a valid DUPR bracket."
    );
  }

  for (const key of ["p1", "p2"]) {
    const label = key === "p1" ? "Player 1" : "Player 2";

    if (!fields[`${key}_name`]) {
      throw new RequestError(
        400,
        `${label}: full name is required.`
      );
    }

    if (!GENDERS.has(fields[`${key}_gender`])) {
      throw new RequestError(
        400,
        `${label}: select a valid gender.`
      );
    }

    if (!validBirthDate(fields[`${key}_dob`])) {
      throw new RequestError(
        400,
        `${label}: enter a valid date of birth, not a future date.`
      );
    }

    if (!/^09[0-9]{9}$/.test(fields[`${key}_phone`])) {
      throw new RequestError(
        400,
        `${label}: mobile number must have 11 digits starting with 09.`
      );
    }

    const email = fields[`${key}_email`].toLowerCase();

    if (
      (key === "p1" && !email) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      throw new RequestError(
        400,
        `${label}: enter a valid email address.`
      );
    }

    fields[`${key}_email`] = email;

    const ratingText = fields[`${key}_dupr`];

    if (ratingText) {
      // Accept ordinary decimal notation, not hexadecimal or Infinity.
      const rating = Number(ratingText);

      if (
        !/^\d+(?:\.\d{1,3})?$/.test(ratingText) ||
        !Number.isFinite(rating) ||
        rating < 2 ||
        rating > 8
      ) {
        throw new RequestError(
          400,
          `${label}: DUPR must be between 2 and 8, with up to three decimal places.`
        );
      }

      fields[`${key}_dupr`] = String(rating);
    }

    if (!SHIRTS.has(fields[`${key}_shirt`])) {
      throw new RequestError(
        400,
        `${label}: select a valid shirt size.`
      );
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
    throw new RequestError(
      400,
      "Player genders do not match the selected division."
    );
  }

  if (!fields.emergency_name || !fields.emergency_relationship) {
    throw new RequestError(
      400,
      "Complete the emergency contact name and relationship."
    );
  }

  if (!/^09[0-9]{9}$/.test(fields.emergency_phone)) {
    throw new RequestError(
      400,
      "Emergency contact number must have 11 digits starting with 09."
    );
  }

  if (fields.payment_ack !== "yes") {
    throw new RequestError(
      400,
      "Please acknowledge the registration fee."
    );
  }

  if (fields.waiver !== "agreed") {
    throw new RequestError(
      400,
      "Both players must agree to the waiver."
    );
  }

  if (!["yes", "no"].includes(fields.has_business)) {
    throw new RequestError(
      400,
      "Please indicate whether you have a business."
    );
  }

  if (fields.has_business === "no") {
    if (fields.wants_promotion === "yes") {
      throw new RequestError(
        400,
        "Business promotion requires an existing business."
      );
    }

    fields.wants_promotion = "no";
    fields.business_name = "";
  } else {
    if (!["yes", "no"].includes(fields.wants_promotion)) {
      throw new RequestError(
        400,
        "Please indicate whether you want business promotion."
      );
    }

    if (
      fields.wants_promotion === "yes" &&
      !fields.business_name
    ) {
      throw new RequestError(
        400,
        "Please enter your business name."
      );
    }

    if (fields.wants_promotion === "no") {
      fields.business_name = "";
    }
  }

  return fields;
}

async function validateLogo(uploadedFile, required) {
  if (!uploadedFile) {
    if (required) {
      throw new RequestError(
        400,
        "Please upload your business logo."
      );
    }

    return null;
  }

  if (!required) {
    throw new RequestError(
      400,
      "A logo may only be uploaded when business promotion is selected."
    );
  }

  if (
    uploadedFile.size < 1 ||
    uploadedFile.size > MAX_LOGO_BYTES
  ) {
    throw new RequestError(
      400,
      "The logo must be between 1 byte and 2 MB."
    );
  }

  const buffer = await readFile(uploadedFile.filepath);

  if (buffer.length < 1 || buffer.length > MAX_LOGO_BYTES) {
    throw new RequestError(400, "Invalid logo size.");
  }

  let detected;

  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch {
    throw new RequestError(
      400,
      "Could not recognize the image format."
    );
  }

  const extension = IMAGE_EXTENSIONS.get(detected?.mime);

  if (!extension) {
    throw new RequestError(
      400,
      "Use a JPG, PNG, or WebP image."
    );
  }

  return {
    buffer,
    extension,
    mimeType: detected.mime,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
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

async function findRegistration(database, id) {
  const { data, error } = await database
    .from(TABLE)
    .select(
      "form_data, fee_due_php, payment_status, " +
      "logo_bucket, logo_path, logo_sha256"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function assertMatchingSubmission(existing, fields, logo) {
  if (
    canonicalJSON(existing.form_data) !== canonicalJSON(fields) ||
    (existing.logo_sha256 || null) !== (logo?.sha256 || null)
  ) {
    throw new RequestError(
      409,
      "This registration reference already exists with different details or a different logo. Contact the organizer."
    );
  }
}

function successResponse(res, status, id, row) {
  return reply(res, status, {
    ok: true,
    registrationId: id,
    feeDuePhp: row.fee_due_php,
    paymentStatus: row.payment_status,
    businessLogoUploaded: Boolean(row.logo_path)
  });
}

async function removeUnusedCandidate(database, path, reference) {
  const { error } = await database.storage
    .from(LOGO_BUCKET)
    .remove([path]);

  if (error) {
    console.warn("LOGO_CLEANUP_REQUIRED", {
      reference,
      path
    });
  }
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
        "Registration is currently closed. Contact the organizer."
    });
  }

  const mediaType = String(
    req.headers["content-type"] || ""
  ).split(";")[0].trim().toLowerCase();

  if (mediaType !== "multipart/form-data") {
    return reply(res, 415, {
      error: "Submit registration using multipart form data."
    });
  }

  const reference = randomUUID();
  const temporaryPaths = new Set();

  let candidatePath = null;

  try {
    const { body, uploadedFile } = await parseMultipartRequest(
      req,
      temporaryPaths
    );

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.submissionId !== "string" ||
      !UUID_V4.test(body.submissionId)
    ) {
      throw new RequestError(
        400,
        "Invalid registration request or reference."
      );
    }

    const fields = validateFields(body.fields);

    const logo = await validateLogo(
      uploadedFile,
      fields.wants_promotion === "yes"
    );

    const database = getDatabase();

    // Check retries before writing anything to Storage.
    const existing = await findRegistration(
      database,
      body.submissionId
    );

    if (existing) {
      assertMatchingSubmission(existing, fields, logo);

      return successResponse(
        res,
        200,
        body.submissionId,
        existing
      );
    }

    if (logo) {
      // Unique per request: never overwrite another request's object.
      candidatePath =
        `${body.submissionId}/${randomUUID()}.${logo.extension}`;

      const { error: uploadError } = await database.storage
        .from(LOGO_BUCKET)
        .upload(candidatePath, logo.buffer, {
          contentType: logo.mimeType,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }
    }

    const row = {
      id: body.submissionId,
      team_name: fields.team_name || null,
      division: fields.division,
      dupr_bracket: fields.dupr_bracket,
      form_data: fields,

      fee_due_php: FEE_PHP,
      payment_status: "unpaid",

      has_business: fields.has_business === "yes",
      wants_promotion: fields.wants_promotion === "yes",
      business_name: fields.business_name || null,

      logo_bucket: logo ? LOGO_BUCKET : null,
      logo_path: candidatePath,
      logo_mime_type: logo?.mimeType || null,
      logo_size_bytes: logo?.size || null,
      logo_sha256: logo?.sha256 || null
    };

    const { error: insertError } = await database
      .from(TABLE)
      .insert(row);

    if (insertError) {
      // Another concurrent request may have inserted this ID.
      // Also resolve uncertain insert responses by checking the row.
      const saved = await findRegistration(
        database,
        body.submissionId
      );

      if (saved) {
        if (
          candidatePath &&
          saved.logo_path !== candidatePath
        ) {
          await removeUnusedCandidate(
            database,
            candidatePath,
            reference
          );

          candidatePath = null;
        }

        assertMatchingSubmission(saved, fields, logo);

        return successResponse(
          res,
          200,
          body.submissionId,
          saved
        );
      }

      throw insertError;
    }

    return successResponse(
      res,
      201,
      body.submissionId,
      row
    );
  } catch (error) {
    if (error instanceof RequestError) {
      return reply(res, error.status, {
        error: error.message
      });
    }

    console.error("REGISTRATION_FAILED", {
      reference,
      code: error?.code || "SERVER_ERROR",
      configuration:
        error?.code === "CONFIG_ERROR"
          ? error.message
          : undefined
    });

    if (candidatePath) {
      // Database and Storage are separate operations.
      // Do not delete after an uncertain insert result:
      // the registration may actually have committed.
      console.warn("LOGO_RECONCILIATION_REQUIRED", {
        reference,
        path: candidatePath
      });
    }

    return reply(res, 500, {
      error:
        "Registration could not be confirmed. " +
        "Retry on this same page without refreshing. " +
        `Reference: ${reference}`
    });
  } finally {
    await Promise.all(
      [...temporaryPaths].map(async (path) => {
        try {
          await unlink(path);
        } catch {
          // Best-effort cleanup of local temporary files.
        }
      })
    );
  }
}