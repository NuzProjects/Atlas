# Shared-source synchronization

The public Atlas source and its private deployment repository share application code, dependencies, generic Docker/packaging tools, selected root documentation, assets and tests. A private GitHub Actions coordinator keeps those approved files aligned in both directions.

Private pushes trigger immediately. Public updates are picked up by a five-minute poll, subject to GitHub scheduling delays. Matching files produce no further commits, so sync commits do not create an endless loop. Normal repository checks run after synchronization; the private deployment continues through its normal verification and health-check pipeline.

Private environment files, credentials, workflows, VPS configuration, provider-specific ad files and coordinator code are excluded. No private-repository or VPS credential is stored in this public repository. Public self-hosted defaults remain independent of maintainer services.

If both sides change the same shared file differently, the conflicting versions are preserved and a review PR is opened privately. Resolve and merge that PR to synchronize the reviewed result. Other non-conflicting updates continue syncing. The coordinator never force-pushes or silently overwrites conflicting edits.
