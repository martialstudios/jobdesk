-- JobDesk.app: opens the career-ops web UI in your browser.
--
-- The installer compiles this into a stay-open applet with osacompile on your
-- own Mac (so Gatekeeper never quarantines it), replacing __JOBDESK_BIN__ with
-- the path to the jobdesk script. While the app is in the Dock, JobDesk's local
-- server is running; quitting the app stops the server.
--
-- No properties or globals: an applet saves those back into itself on quit,
-- which would break its code signature.

on jobdeskBin()
	return quoted form of "__JOBDESK_BIN__"
end jobdeskBin

on run
	openJobDesk()
end run

-- Clicking the Dock icon again re-opens the browser tab.
on reopen
	openJobDesk()
end reopen

on openJobDesk()
	try
		do shell script jobdeskBin() & " open --from-app"
	on error errText number errNum
		if errNum is -128 then return
		-- 3: `jobdesk stop` ran while JobDesk was starting. Not a failure.
		if errNum is 3 then
			quit
			return
		end if
		set dialogResult to display dialog "JobDesk couldn't start." & return & return & errText buttons {"Show Log", "OK"} default button "OK" with title "JobDesk" with icon caution
		if button returned of dialogResult is "Show Log" then
			try
				do shell script jobdeskBin() & " logs --reveal"
			end try
		end if
		quit
	end try
end openJobDesk

-- If the server stops some other way (e.g. `jobdesk stop` in Terminal), quit
-- too, so the Dock never shows JobDesk as running when it isn't. This only
-- asks whether the server process exists (no web request), so a server that's
-- busy for a moment is never mistaken for a stopped one.
on idle
	try
		do shell script jobdeskBin() & " alive"
	on error
		quit
	end try
	return 30
end idle

-- Stopping is a no-op when the server is already gone.
on quit
	try
		do shell script jobdeskBin() & " stop --quiet"
	end try
	continue quit
end quit
