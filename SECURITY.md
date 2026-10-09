# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Instead, either:

* use GitHub's [private vulnerability reporting](https://github.com/ombdj1209/openlessons/security/advisories/new), or
* email **omprakashbdj1209@gmail.com**

Include what you found, how to reproduce it, and the impact you expect. You will get a reply within a few days, and credit in the release notes if you would like it.

## Scope

OpenLessons is a static site with no backend, accounts or data collection. Progress is stored only in your own browser. The most relevant risks are:

* a lesson file that makes the app run code or inject markup (lessons must be pure data)
* a vulnerable dependency shipped in the build

Only the latest release on `main` receives fixes.
