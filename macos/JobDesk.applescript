-- JobDesk.app: opens the career-ops web UI in your browser.
--
-- The installer compiles this into a stay-open applet with osacompile on your
-- own Mac (so Gatekeeper never quarantines it), replacing __JOBDESK_BIN__ with
-- the path to the jobdesk script. While the app is in the Dock, JobDesk's local
-- server is running; quitting the app stops the server.

property jobdeskBin : "__JOBDESK_BIN__"

on run
	openJobDesk()
end run

-- Clicking the Dock icon again re-opens the browser tab.
on reopen
	openJobDesk()
end reopen

on openJobDesk()
	try
		do shell script quoted form of jobdeskBin & " open --from-app"
	on error errText number errNum
		if errNum is -128 then return
		set dialogResult to display dialog "JobDesk couldn't start." & return & return & errText buttons {"Show Log", "OK"} default button "OK" with title "JobDesk" with icon caution
		if button returned of dialogResult is "Show Log" then
			try
				do shell script quoted form of jobdeskBin & " logs --reveal"
			end try
		end if
		quit
	end try
end openJobDesk

-- If the server was stopped some other way (e.g. `jobdesk stop` in Terminal),
-- quit too, so the Dock never shows JobDesk as running when it isn't.
on idle
	try
		do shell script quoted form of jobdeskBin & " status --quiet"
	on error
		quit
	end try
	return 30
end idle

on quit
	try
		do shell script quoted form of jobdeskBin & " stop --quiet"
	end try
	continue quit
end quit
