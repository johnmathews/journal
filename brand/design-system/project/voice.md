# Voice

Journal writes like a calm, plain notebook: brief, in the second person, in British English. Facts first, then the next step. It is a tool for one person's private writing, so it never cheers, sells or guilts.

## The choices

| Choice | Journal |
| --- | --- |
| Who speaks | No speaker. There is no "we". The app is a tool, not a company. |
| The reader | "you", and "your entries", "your account" |
| Language | English only, British spelling ("colour", "analyse") |
| Numbers | Figures everywhere ("3 entries", "6-digit code") |
| Exclamation marks | None |
| Dates | Day, short month, year: "27 Nov 2026", "27 Nov 2026, 14:05" (en-GB, 24-hour) |
| The product | "Journal". Today's sidebar title, "JOURNAL INSIGHTS TOOL", is the one place it is set in capitals. |

## Rules

- **Lead with the thing.** The first words say what happened or what this is. "Invalid email or password", not "Sorry, something went wrong with your login".
- **An error says what happened and what to do.** "Couldn't load your entries. Reload the page to try again." A message that ends at "failed" leaves the reader stuck.
- **Sentence case everywhere** in new copy: buttons, headings, tabs and labels. Today's Title Case labels ("Sign In", "New Entry", "Job History") move to sentence case when their screen is next touched. Don't add new ones.
- **No uppercase letter-spaced labels.** The sidebar title is the one exception, and it is kept as it is.
- **A button is a verb and its object.** "Save changes", "Delete entry", "Create API key". Avoid "Submit", "OK" and "Yes".
- **Name the subject.** Write "this entry" or "your accent colour" wherever "it" could point at more than one thing.
- **Exact, never hyped.** "Synced 4 minutes ago", not "up to date in real time". No "seamless", "powerful" or "magic".
- **Never blame the reader.** "That password didn't match" rather than "You entered a wrong password".
- **Contractions are welcome.** "Couldn't", "it's", "you'll".
- **No semicolons or em dashes.** Use a full stop, a comma or brackets.
- **Say what it doesn't do.** "Saved to your account, so it applies on every device" tells the reader where the choice reaches, and where it doesn't.

## Instead of, write

Built from strings in the app today. The left column is a real string; the right is how new or touched copy writes it.

| Instead of | Write |
| --- | --- |
| Failed to load entries | Couldn't load your entries. Reload the page to try again. |
| Failed to delete entry | Couldn't delete this entry. Try again. |
| Delete failed | Couldn't delete it. Try again. |
| Email and password are required. | Enter your email and password. |
| Bad password | That password didn't match. |
| Sign In | Sign in |
| New Entry | New entry |
| Your session has expired. Please sign in again. | Your session has ended. Sign in again to carry on. |
| Email verification failed. The link may have expired. | That link didn't work. It may have expired, so ask for a new one. |

## Already right

These strings, from the Appearance setting, show the voice as intended:

- "Buttons, links, the current page in the sidebar and selected items use this colour. It's saved to your account, so it applies on every device."
- "Enter the 6-digit code from your authenticator."

## Banned words

None yet. If a word ever needs banning (a term that misleads about privacy, say), list it here with the reason and mirror it into `checks.json` `forbidden_words`, so the gate enforces it.
