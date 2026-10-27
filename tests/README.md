# Cross-package verification

Focused source and package tests currently live beside the code in
`apps/cli/scripts/`. Add cross-package integration tests here when they exercise
more than one owned boundary. Keep model traffic scripted unless a live test is
explicitly authorized.
