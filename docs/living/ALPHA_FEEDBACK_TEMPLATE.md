# Alpha Feedback Template

Use this file as a scratch template when validating a build by hand or on the machine.

## Session

- Date:
- Build/version:
- Machine/controller:
- Material:
- Tool:
- Laser mode (`M3 I` / `M4 I`), if applicable:
- Laser depth calibration at 100% / pass, if applicable:
- Firmware notes:

## Job Summary

- What was drawn/imported:
- Operation types used:
- Cut side used:
- Tabs used:
- Laser process, power/speed, passes, interval, and overscan:
- Raster image type/size and power range:
- Export only or machine run:

## What Worked

- 

## Problems Found

For each issue, capture:

- Area:
- Severity: `P0` / `P1` / `P2`
- Steps to reproduce:
- Expected result:
- Actual result:
- Machine risk or user impact:
- Screenshot/G-code snippet/location:

## Validation Notes

- Did the preview match the machine motion?
- Did tabs behave as expected on every pass?
- Did safe Z and start/end motion behave as expected?
- Did tool/material defaults produce sane feeds and pass depths?
- Did the job-wide material remain consistent across every operation?
- For laser jobs, did power turn off before every rapid, turnaround, and overscan move?
- Did `0–100%` power map to the expected `S0–S255` values?
- Did test-pattern labels finish before the test cells?
- Did raster brightness map in the expected direction and produce recognizable detail?
- How did measured laser depth compare with the advisory result preview?
- Did full-depth cuts appear separated in the result preview and separate on the workpiece?
- Did save/load preserve the setup correctly?

## Follow-Up Candidates

- 
