# Fail-closed number gate (NL2Repo sample)

Build a small command-line tool from this spec. Do not invent extra features.
Do not call the network. Do not add a database.

## Benchmark style

NL2RepoBench-style clear document: numbered behaviours, 1:1 with tests.

## Background

A publishing pipeline must not print a number it cannot prove. If a draft
contains a digit sequence that is not in a local allowlist, the tool must
print nothing and exit with failure. Silence is correct. A guessed number
is not.

## Core functionality

1. The tool is invoked as: `failclosed STATEMENT`
2. It reads an allowlist file named `allowlist.txt` in the current working
   directory.
3. Each non-empty line of `allowlist.txt` is one allowed token: digits only
   (example: `100` or `1900`).
4. A "number" in the statement is a run of one or more digits.
5. If every number in the statement appears in the allowlist, print the
   statement exactly, followed by a single newline, and exit 0.
6. If the statement contains no numbers, print the statement exactly,
   followed by a single newline, and exit 0.
7. If any number in the statement is missing from the allowlist, print
   nothing to stdout, print a one-line reason to stderr, and exit 1.
8. If `allowlist.txt` is missing, print nothing to stdout, print a one-line
   reason to stderr, and exit 1.

## Constraints

- Language: Python 3.12
- Single command name: `failclosed` (a console script or `python -m failclosed` is not enough; the command must be `failclosed`)
- No network. No extra files except `allowlist.txt` and the tool itself.

## Non-goals

Not a web app. Not a CMS. Not HubSpot. Not a job board.
